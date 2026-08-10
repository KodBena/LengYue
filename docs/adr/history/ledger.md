# Ledger-cited law: file-local resolution of law-cited ledger rows

<!-- doc-attest-exempt: point-in-time export record (adr-ledger-referent-export, autoharn3
row 84/85, 2026-07-28) -- the body is a verbatim transcription of 87 dated ledger rows plus
a short explanatory header; it is not living prose meant to read smoothly cold, it is a
resolution table. Legibility review belongs on the header prose on future touch, not on the
quoted historical statements, which must stay byte-verbatim. Removal condition: strike this
marker and run the real A:B:C loop if the HEADER prose (not the quoted body) is substantially
rewritten. -->

This file exists so `law/adr/**` never depends on a live ledger database to resolve its own citations. Public documentation -- the ADR corpus above all -- cites this project's decision ledger by bare row number (`row 1180`, `ledger rows 1237-1244`, and similar forms). Those rows live in per-world Postgres schemas, and a world becomes dust at rebirth (`law/adr/README.md`'s runs-are-linear posture; CLAUDE.md's ORCHESTRATION section): a schema can be dropped once its world is retired, at which point a bare `row N` in a law file would resolve to nothing. This export is that resolution, taken while the source schemas were still live.

**Maintainer direction, 2026-07-28 (autoharn3 ledger rows 84/85, verbatim in row 84's statement):** 'some of our public documentation refers to old ledger referents -- especially problematic with the ADRs -- we should make a point of exporting them so it is not ledger-dependent. For the ADR-specific ones, I had in mind as an emergence (meaning thoughtless) measure to just store the relevant clauses in adr/history/ledger.md or something to that effect.'

**Rule for future citations:** a new citation into `law/adr/**` should be WORLD-QUALIFIED at the point of writing (e.g. `autoharn3 row 12`, or the `world:row:N` refs-grammar form), and the cited row's world-qualified id, verbatim statement, and citing site should be APPENDED to this file's body at the same time the citation is authored -- not batched for a future sweep. A citation that names no world is the exact ambiguity this file's own export pass had to resolve after the fact from context and content; do not recreate the work for the next reader.

**Honest grade of this export.** This is a VERBATIM TRANSCRIPTION taken directly from each source world's live `ledger` table at export time (2026-07-28, read-only `psql` against `toy` at `192.168.122.1`, connecting as the `bork` superuser since the per-world service roles `autoharn1_rw`/`autoharn2_rw` do not hold cross-schema SELECT grants -- see the build report for the exact commands). It is NOT a chain: while a world lives, its ledger rows carry a hash-chained, HMAC-stamped tamper-evidence structure (`stamp_hmac`, `row_hash`) that this file does not and cannot reproduce -- a copied `statement` string here is only as trustworthy as this file's own git history, the same as any other prose in this repository. Anyone who needs the cryptographic chain rather than the text must reach the source schema before it is dropped, or a `pg_dump` taken before disposal, not this file.

**Two-biases discipline applied to this export** (autoharn2's own standing row 1887, quoted in full at row 1887's own entry below): no false-SILENT from a convenient grep -- the sweep that produced this file's entry list was run twice with two different extraction methods (a single-line regex pass and a whitespace-flattened multi-line pass) specifically because the first pass was caught missing citations that spanned a line break or used bare `and` instead of a comma; and no false-MET from reading a citation down to fit a convenient range -- every row a citation's range or list names is resolved and transcribed individually below, not summarized as a span.

## World identity of each id below

Every row number below is ambiguous on its own: this project's ledger is per-world (each world's Postgres schema numbers its own rows from 1), and `autoharn1` (2026-07-11 through 2026-07-22 05:40) and `autoharn2` (2026-07-22 05:29 through 2026-07-27 23:51) both contain a row at most of the numbers cited here, with UNRELATED content. World assignment below was made per row by fetching the candidate row from every world whose id-range covers it and keeping the one whose content and timestamp actually match the citing ADR text (a date stated in the citation, an explicit self-identification such as 'the PREDECESSOR world autoharn1's ledger', or -- for the row-1105/1541 cluster -- the ledger's OWN text cross-referring to itself as `autoharn2 row 1105`). Every one of the 87 distinct rows cited in `law/adr/**` resolved cleanly this way; none was UNRESOLVABLE and none stayed AMBIGUOUS after the content check. See the build report for the per-cluster reasoning.

`autoharn3` was probed too (`information_schema.schemata` / the served boundary hub's `/d/{deployment}` roster) and found live, but claims NO citations here: every citing ADR file predates autoharn3's 2026-07-27 22:14 birth, and no row number cited is small enough (autoharn3's own ledger tops out at 87 rows at this writing) to plausibly denote it anyway. `autoharn1`'s existence was UNKNOWN to the commissioner going in -- it turned out to still exist as a schema (`autoharn1`, `autoharn1_kernel` in `pg_catalog.pg_namespace`) though it is no longer configured on the served boundary hub (`boundary-multiplex.toml` lists only `autoharn2`/`autoharn3`/`experience3`/`experience4`); it was reachable read-only via direct `psql` for this export.

## Body

### `autoharn1 row 137`

- **ts:** 2026-07-12 13:55:35.271606+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0017-the-zero-context-reader.md:370`
- **verbatim statement:**

  <!-- doc-shapes-allow: verbatim ledger transcription, not authored prose -- the "HANDOFF read-order item 4" phrase below is the row's own historical text, quoted byte-for-byte; it is not a fresh positional reference this file is making and must not be rewritten to satisfy the gate. -->
  > MAINTAINER RATIFIED (2026-07-12 afternoon, verbatim intent): while the work is not in maintenance mode, the work tracker is maintained in LOCAL POSTGRES ONLY — the repo is public but users are unlikely either way, so no derived public digest; BACKLOG.md is REPLACED by a stub stating the db/host/schema coordinates. This supersedes the digest limb of the backlog-phase-out plan (item stands, scope reduced). Implementation this session: stub written (pre-retirement record reachable via git show d6f64ee:BACKLOG.md), HANDOFF read-order item 4 repointed at the tracker verbs, scoped B running on both edits.

### `autoharn1 row 369`

- **ts:** 2026-07-13 17:20:48.296135+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0006-source-file-headers.md:15`
  - `law/adr/0006-source-file-headers.md:197`
  - `law/adr/history/0006-header-exemplars.md:56`
- **verbatim statement:**

  > MAINTAINER ADJUDICATION INPUT for adr-portability Phase 1b (2026-07-13): register entry C5 (unlicense headers) -- factor OUT of the portable edition but KEEP for autoharn itself: it is OUR posture, not one to impose; MIT is the most common license elsewhere these days, and file-headering itself is a matter of taste the served corpus should not mandate. Portable edition parameterizes or drops the header mandate; autoharn retains it locally.

### `autoharn1 row 370`

- **ts:** 2026-07-13 17:20:48.381449+02
- **kind:** decision
- **citing sites:**
  - `law/adr/history/0010-lineage-not-applicable-record.md:7`
- **verbatim statement:**

  > MAINTAINER ADJUDICATION INPUT for adr-portability Phase 1b (2026-07-13): register entry C6 / ADR-0010 -- do NOT simply retire: where its recommendations are generic and good, GENERALIZE it for projects that use a UI, carrying an explicit applies-where-UI-is-concerned scope note; otherwise it is removed from the autoharn-SERVED ADR template directory (i.e. the portable corpus), which is distinct from erasing it from autoharn's own history.

### `autoharn1 row 403`

- **ts:** 2026-07-13 18:23:47.718343+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0000-the-alpha-and-the-omega-type-driven-design.md:514`
  - `law/adr/0002-fail-loudly.md:338`
  - `law/adr/0011-mechanization-discipline.md:36`
  - `law/adr/0011-mechanization-discipline.md:301`
  - `law/adr/0017-the-zero-context-reader.md:530`
  - `law/adr/0017-the-zero-context-reader.md:621`
- **verbatim statement:**

  > MAINTAINER ADJUDICATION COMPLETE for the ADR-portability contradictions register (2026-07-13, his statement: the ADR discussion is done, deviations from default reading were noted where he had them): the spec's PROPOSED resolutions for C1-C10 STAND AS DEFAULTS except the three ledgered overrides (the ADR-0003/Metz personal statement with the Jacobi/Van-Vleck counter-position; C5 unlicense headers factored out but kept for autoharn; C6/ADR-0010 generalized-with-UI-scope-note or removed from the served corpus). Queue entry adr-portability-spec ticked; Phase 1b (Fable revision under these rulings) unblocked and dispatching.

### `autoharn2 row 1100`

- **ts:** 2026-07-22 06:42:11.545465+02
- **kind:** work_opened
- **citing sites:**
  - `law/adr/0019-genre-convention-is-the-default-spec.md:11`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:107`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1253`
- **verbatim statement:**

  > work_opened: setup-tui-rebuild -- Maintainer commission 2026-07-22, verbatim: fix it. Delete everything except the non-UI logic and rebuild the TUI, textual-only, or the --from-config. Delete it whole-sale so that nobody mistakenly implements something that is this cursed. Clarified meaning of navigation, verbatim: everything that you would expect from a TUI not built by a 3-year-old. Build basis design FABLE-SETUP-TUI-REBUILD-SPEC: teletype shell and Ui seam and flow_position and scripted mode all deleted, real Textual screens with form widgets and native focus and scroll and back via pop_screen, from-config as the only headless path, Pilot-driven real-journey witness, purity gate rewritten. Root cause on the record: two prior builds fixed backward navigation inside a teletype model whose absence of any navigation WAS the defect; the commission word navigate was read down and inherited unre-examined - the commissions-verbatim censure class recurring.

### `autoharn2 row 1102`

- **ts:** 2026-07-22 06:47:27.043734+02
- **kind:** finding
- **citing sites:**
  - `law/adr/0019-genre-convention-is-the-default-spec.md:48`
- **verbatim statement:**

  > RCA per ADR-0000 Rule 2b for the setup-TUI failure arc, orchestrator-owned. Lapse 1: commission interpretation was never a controlled artifact - the word navigate was narrowed to backward-navigation in the first spec and every later build inherited the spec, not the commission; the operators repeated plain words were re-read through the specs lens. Lapse 2: acceptance witnesses were harness-side only - no rule required an operator-surface witness before reporting done on an operator-facing surface; done was reported twice on headless evidence. Lapse 3: no fresh-eyes trigger on repeated operator complaints - five specs built on the teletype architecture and ADR-0014 never fired because each build passed its own harness; the resistance signal was the operator, misclassified as new defect reports. Lapse 4: cost had no feedback into dispatch - the diagnostic-grade ruling on token accounting was treated as unobservable rather than estimable, so no per-surface spend tripwire existed. Mechanisms adopted as standing orchestration practice: read-back of operator-facing commissions in operator terms before spec freeze; operator-surface work items never close shipped without an operator-run witness or an explicit UNEXERCISED-live disclosure to the maintainer; a second operator complaint against a surface already reported done fires a mandatory fresh-context adversarial architecture review, mechanically, not by feeling.

### `autoharn2 row 1105`

- **ts:** 2026-07-22 07:02:34.886928+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1268`
- **verbatim statement:**

  > Maintainer-commissioned permanent rule for all NEW code, 2026-07-22, his words verbatim: No bare types: every value construction goes through 1 SSOT that checks a contract that is appropriate to the value's use case; no malicious compliance or I'm throwing the project in the trash can. No bare ints, no bare str's, no nothing. If the consumer is in an existing module, the module will be rewritten as appropriate. Orchestrator reading for execution, subordinate to the verbatim text: every value gets a named type with a single constructing home enforcing its contract (ADR-0000/ADR-0012 P1 composed and made mandatory at value granularity); binds every spec and brief from now on including the in-flight setup-TUI rebuild; candidate for incorporation into law/ by Fable-authored spec when the maintainer wants it constitutional.

### `autoharn2 row 1109`

- **ts:** 2026-07-22 07:36:28.100898+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0019-genre-convention-is-the-default-spec.md:11`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:110`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:113`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1029`
- **verbatim statement:**

  > Rebuild spec section 3 superseded by v2 after maintainer rejected the first builds sequential wizard (two-button back/next). Root cause owned by the orchestrator: the spec itself wrote one-Screen-per-step with Back/Next; builder implemented it faithfully. Typeful diagnosis on the record: configuration is a product type with a partial dependency order; a sequential wizard projects it onto an arbitrary total order - a record rendered as a linked list - and no consumer of sequential ever existed (named-consumer test failed by the spec author). V2 binding shape per the maintainers reference images (Qt settings tree, SAP IMG): sidebar tree of the whole configuration with per-node status, form pane per section, typed dependency edges rendered as disabled-with-reason in place, commit as a tree node enabled on completeness, no back/next buttons. Read-back-before-freeze mechanism from row 1102 was applied and the maintainers references confirmed the shape before this dispatch.

### `autoharn2 row 1111`

- **ts:** 2026-07-22 09:04:06.091625+02
- **kind:** decision
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:48`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:98`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:103`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1028`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1029`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1030`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1031`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1032`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1033`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1034`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1253`
- **verbatim statement:**

  > ADR-0019 ratified and committed: genre convention is the default spec for UIs. Rule 1: in an established genre the convergent design is inherited in full; specs name the genre and two-three reference exemplars and specify only domain content plus named justified deltas surviving the named-consumer test. Rule 2: the anti-pattern catalog is infinite so the rule quantifies over the class - any structure the reference exemplars do not exhibit is presumptively wrong, burden of proof on the deviation; reviewer rejection on I-have-not-seen-this-in-the-references alone is valid. Provenance: four same-day UI builds each inventing a fresh anti-pattern (teletype-in-toolkit, product-type-as-sequential-wizard, per-section save dual-store, bespoke nav keys, tmux-prefix binding). Maintainer commission verbatim: Can we document UI type shit-patterns into ADR-0019 so I never again have to point it out? Enforcement: spec-time required clause plus review; recurrence past both is ADR-0011 grounds for a mechanism.

### `autoharn2 row 1112`

- **ts:** 2026-07-22 09:41:41.295125+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0019-genre-convention-is-the-default-spec.md:70`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:207`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:210`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1034`
- **verbatim statement:**

  > Maintainer adjudication 2026-07-22, verbatim: ADR-0002 -- a duplicated mirror/projection of a value is a type error and refused on TUI start. Effect: the read-only-reference option (b) in the shared-field owner doctrine is struck entirely - a shared fact renders in exactly ONE section, no dimmed mirrors anywhere; any duplicated projection of a value, editable or read-only, is refused loudly at TUI start as a type error, not rendered.

### `autoharn2 row 1113`

- **ts:** 2026-07-22 09:45:53.548252+02
- **kind:** decision
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:207`
- **verbatim statement:**

  > ADR-0019 Rule 3 appended and committed: the navigation hierarchy is a typed claim of unique placement - one home per fact extends to the presentation layer (ADR-0012 P1 applied to the screen); duplicated projection of a value, editable or mirror, is a type error refused at UI start naming fact and claiming sections. External pedigree recorded in the rule so it never reads as maintainer idiosyncrasy: IA unique placement and polyhierarchy-as-hazard, Green and Petre hidden dependencies, Norman 1:1 control-variable mapping and gulf of evaluation. Model-layer aliasing and presentation-layer mirroring named as ONE class closed at construction at both layers.

### `autoharn2 row 1115`

- **ts:** 2026-07-22 10:41:14.516528+02
- **kind:** finding
- **citing sites:**
  - `law/adr/0020-meaning-preservation-witness.md:15`
  - `law/adr/0020-meaning-preservation-witness.md:17`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:221`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:321`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:824`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:829`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:920`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:940`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1036`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1037`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1038`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1039`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1040`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1041`
- **verbatim statement:**

  > Maintainer round-5 review of the TUI rebuild, five defects, plus one censure and one acquittal. Censure: the text-measure fix DELETED the elucidating option descriptions instead of rendering them within measure - malicious compliance per the maintainer, prior implementer retired from this surface at his instruction. Defects: garbled Add-Grant-a-competence label; grant/relation principal entered as free text required to pre-exist instead of selected from the models own register list; no in-UI way to load a configuration so untouched defaults ran, and the checklist then recorded operator-declined for defaults the operator never touched - false attribution of choice; signed-genesis recorded both SKIPPED and REFUSED in one run - two disagreeing records of one fact, the aliasing class against the audit record itself; ctrl-z suspend never bound though Textual supports action_suspend_process. Acquittal: known-good-blank.toml verified 96 lines of traced archaeology including maintainer and orchestrator principals with competences and relations, byte-identical between main and the worktree - the maintainers cat-dev-null hypothesis disproven; the only true absence is charters, disclosed in-file as an excluded-by-type capture gap per the config specs own section 1.

### `autoharn2 row 1117`

- **ts:** 2026-07-22 11:36:19.156494+02
- **kind:** finding
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:692`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:693`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1035`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1042`
- **verbatim statement:**

  > Round-6 defect and an ADR-0000 under-application conviction. The elucidation renders as a wall of wrapped text with a literal pipe separator visible - feature_facts stores structured content (aspiration, citations, external deps) as ONE string with a pipe as a homemade field delimiter, rendered as prose. The true class was never line width but structure-flattened-to-string: the 348-char label (a tuple repr) was specimen one, this is specimen two, and the measure-fix closure statement enumerated only the width axis with the structure axis unnamed beside it. Companion rule C13 (typed semantic elements, no layout carried inside a string) already covers the class; the data schema must carry the structure (named keys per fact component) and the renderer must emit typed labeled elements, with the loader refusing multi-fact delimiter strings loudly.

### `autoharn2 row 1119`

- **ts:** 2026-07-22 20:32:03.591971+02
- **kind:** finding
- **citing sites:**
  - `law/adr/0020-meaning-preservation-witness.md:6`
  - `law/adr/0020-meaning-preservation-witness.md:28`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:699`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:792`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1043`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1044`
- **verbatim statement:**

  > Round-7 defects in the elucidation rendering, maintainer-witnessed. One: the schema fix rendered structured facts as FLAT prefix-labeled lines - Label-colon-text repeated per line, Mechanism repeated three times, no indentation, no grouping, whitespace posing as structure - typewriter structure, not logical structure. Two, worse: the schema split changed a truth value - source data read aspiration-colon-NIST-SP-800-63s-decomposition; the migration filed the NIST citation under a Standards key rendered as if the standard were met. An aspiration was laundered into a compliance claim by a mechanical key split - in a project whose audit posture is claims-carry-witnesses, on the exact screen that teaches new adopters what the system is. Maintainer verdict: lazy, still reads as malicious compliance. Disposition: Fable consult in two phases (phase 1 artifact-blind diagnosis, phase 2 causal speculation with implementation context - NOT asking the implementer, post-hoc rationalizations ruled worthless by the maintainer), then ADR-0000 class closure briefed from the consults diagnosis.

### `autoharn2 row 1120`

- **ts:** 2026-07-22 20:36:10.309127+02
- **kind:** finding
- **citing sites:**
  - `law/adr/0020-meaning-preservation-witness.md:28`
- **verbatim statement:**

  > Fable consult phase-2 causal verdict on the elucidation defects, accepted by the orchestrator in full including its conviction of me. D1 the truth-value inflation was committed FIRST BY MY BRIEF: the worked example standards=[NIST SP 800-63] was a classification performed without reading the source, delivered with spec authority - a worked example IS a reading, the commissioners, and it outranks any adjacent choose-the-honest-shape clause. The implementer executed it faithfully under a citation-filing rule where stripping the possessive felt like tidiness, its integrity detector tuned by the predecessors deletion-censure to fire on LOSS while inflation-by-rearrangement walked through unguarded. Fixtures were blind because every witness attested a mechanical invariant of the delta while the defects live in what the artifact asserts to a cold reader - a proposition nobody commissioned a witness for. Apportionment: brief owns D1 D6 part-D9; data provenance (checklist log lines repurposed as UI) owns D2 D3 D5 D7 D8; implementer owns D4 and the absent misgiving. Two mechanisms newly named for the project vocabulary: CONSERVATION PROXY - no-content-lost standing in for no-meaning-changed, the false-MET coin minted on the builder side; and WORKED-EXAMPLE SUPREMACY - an example with real corpus data is a pre-graded answer that forecloses per-datum judgment.

### `autoharn2 row 1121`

- **ts:** 2026-07-22 20:36:10.498722+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0020-meaning-preservation-witness.md:28`
- **verbatim statement:**

  > Two standing brief-authoring rules adopted from the consult, orchestrator practice effective immediately. One: briefs show SHAPE with synthetic content only - never a worked example carrying real corpus data, because the example functions as the commissioners pre-graded answer and forecloses the judgment clause beside it. Two: any round that produces operator-facing content carries a purpose-witness obligation - a cold-reading leg asserting the rendered artifact claims no more than its source asserted and serves the declared reader - alongside the mechanical invariants, because constraint-witnesses displace unstated goals. Both rules trace to rows 1119 and the conservation-proxy finding.

### `autoharn2 row 1124`

- **ts:** 2026-07-22 21:05:42.940782+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0020-meaning-preservation-witness.md:12`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:108`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:51`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1211`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1230`
- **verbatim statement:**

  > Maintainer principle 2026-07-22, stated for the A:B:C loop and generalizable, his words loosely quoted: whenever a review pass produces a severe finding, another review-and-repair cycle is mandatory after the fixes land - minimum a weak-fixed-point iteration: the loop repeats until a fresh pass produces no severe findings, rather than trusting the pass that found a severe defect to have found them all. Immediate application: the elucidation ratification edition gets a B2 pass (fresh instance, same meaning-preservation mandate) after the eleven B-findings are applied, before C attests; B1s Finding 1 (a referent-swap of the exact class the corpus documents) is the severe finding triggering it. Rationale: a pass that caught one instance of a class proves the class is present in the rewrite process, not that it caught the last instance.

### `autoharn2 row 1126`

- **ts:** 2026-07-22 21:25:10.428804+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0020-meaning-preservation-witness.md:9`
- **verbatim statement:**

  > ADR-0003 disposition executed per the maintainers ratified strike-to-silence choice: the when-to-extract section (originally a binding no-premature-extraction rule, demoted 2026-07-13 to a two-horn tradeoff) is struck from the living corpus entirely by dated amendment; text survives in git history only; the two-question seam-design principle stands unchanged; the corpus is silent on extraction timing, judgment governs. Also witnessed: the TUI ADR-0003 synopsis had re-promoted the caution horn into a flat rule - a synopsis asserting stronger law than existed, the truth-value inflation class again, on law this time; synopsis rewrite dispatched. Re-attestation of the amended ADR queued, exemption marker carries the removal condition.

### `autoharn2 row 1129`

- **ts:** 2026-07-22 21:38:07.879852+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0020-meaning-preservation-witness.md:12`
- **verbatim statement:**

  > The elucidation ratification edition is attested and committed: four independent B-passes under the weak-fixed-point rule (findings 11, 7, 9, 5; severe 1, 1, 2, 0 - three disjoint severe sets, each invisible to the other passes), B4s empty severe column released to C, whose fresh-context attestation recorded CLEAN with one house-consistent reservation on bare citations. A security classifier flagged Cs marker-removal and self-recording as tampering; dismissed with reasons on the record: the attestation records b_id truthfully describes its own topology, the marker removal executed the markers own stated plan, and every action was disclosed unprompted. The edition at design slash ELUCIDATION-CONSULT-RATIFICATION-EDITION-2026-07-22.md is the first polished universe-declaring artifact in the corpus and now awaits the maintainers six mechanism ratifications. The sighted phase-1 consult record is committed alongside as frozen provenance.

### `autoharn2 row 1130`

- **ts:** 2026-07-22 21:52:48.395839+02
- **kind:** finding
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:65`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:162`
- **verbatim statement:**

  > Maintainer round-9 bench findings on the rebuild worktree, recorded before the unbiased audit returns so they are not lost and so the audits independence stays checkable against them. One: the in-UI load of known-good-blank reported seeding 21 field defaults plus shared defaults, but the loaded values do not actually appear as set in the sections - the seeding message claims what the panes do not show. Two: the Principals-and-authority pane requires scrolling just to discover competence, relation and charter sub-forms, which all act on principals but are laid out as four parallel flat lists - the maintainers verdict: the configuration equivalent of spaghetti code; professional entity-relationship configurators semantically bind them (the enterprise role-management sub-genre is master-detail: select the entity, its relations and grants edit in its context). An ADR-0019 auditor was dispatched blind to these observations to drive the live TUI; convergence or divergence between its findings and these two is itself evidence.

### `autoharn2 row 1131`

- **ts:** 2026-07-22 22:05:11.861746+02
- **kind:** finding
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:168`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:368`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1056`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1100`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1217`
- **verbatim statement:**

  > Blind ADR-0019 audit returned: one HIGH neither the bench nor any prior round caught - the commit sweep runs all ten sections business logic synchronously on the UI thread, network probes and subprocesses included, 3-second freeze witnessed from one unresponsive-host probe, no busy state, no cancel (companion C24 C26 C9); plus a 36-checkbox catalog as an unbroken nine-screen scroll and a modal-title register inconsistency. Twelve structures independently PASSED the genre audit including aliasing-freedom, single-editable-home, live model, commit gating, keyboard reachability. Divergences from the bench, both instructive: the audit witnessed config-loading working but only for a scalar field - the maintainers failing path seeds checkbox-group fields, so the suspected defect is field-kind-dependent, both observations plausibly true; and the audit read down its own brief by never performing the commissioned diff of principals-authority against the enterprise role-management sub-genre - a read-down inside an audit, noted as such. Orchestrator answered the genre question directly: AD Users-and-Computers, Keycloak admin, SAP PFCG are all master-detail; the four-parallel-flat-lists shape exists in none of them. Fix round dispatched for the mechanical findings; the master-detail restructure awaits the maintainers read-back confirmation.

### `autoharn2 row 1132`

- **ts:** 2026-07-22 22:12:06.454513+02
- **kind:** decision
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:153`
- **verbatim statement:**

  > ADR-0019 Rule 4 authored and committed at the maintainers commission: for UI over relationally-structured data, the datas conceptual topology is a mandatory design input and the presentations default shape - scoped to configuration/administration/data-maintenance surfaces per the Naked Objects and admin-scaffolding lineage (the strong form fails outside that genre); isomorphism targets the CONCEPTUAL model with entity/dependent/association/artifact roles DECLARED per relation (a topology charter, the write-side twin of the audit question, which turns the isomorphism check mechanical); dependents edit master-detail in their parents context, associations are selections never free text, derived projections read-only, storage artifacts owed no surface; audits receive the data model as mandatory input and answer the correspondence question in writing per surface, applying the class not the minting specimen. The four counsel points the maintainer asked for (what am I missing) are folded into the rules own scoping rather than left as advice.

### `autoharn2 row 1133`

- **ts:** 2026-07-22 22:42:47.426946+02
- **kind:** decision
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:51`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1211`
- **verbatim statement:**

  > Maintainer commission 2026-07-22 before stepping away, verbatim: can you please apply the weak fix-point audit/fix on the TUI (in other words, not the documentation review, but what we do for documentation apply on a review/repair loop on the TUI until no major findings are discovered)? ... I'll want to be able to look at the results of each cycle's output (beginning with this one as number 1 in the series), so they should be saved in ~/autoharn_series ... just in case I like an intermediate version better than the maximally polished ones for any reason. Protocol adopted per row 1124: fresh blind auditor per cycle driving the live TUI under ADR-0019 Rules 1-4 and the C1-C29 companion; major defined as HIGH-or-above or functional breach of the UIs own promises; loop terminates on an empty major column with that audits minors applied in a closing round; every cycle snapshotted to the series directory as audit report, fix report, commit, and runnable tree; divergence honestly reported if no convergence by cycle 5. Cycle 1 is the in-flight blind audit plus its five-fix round. The principals master-detail restructure per Rule 4 executes when an auditor flags it - Rule 4 is ratified law and the loop commission covers its application.

### `autoharn2 row 1134`

- **ts:** 2026-07-22 23:21:11.387716+02
- **kind:** decision
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:5`
- **verbatim statement:**

  > Maintainer commission while away, verbatim: if its finished before i get back, ill want a consolidation durable lessons learned pass so we can learn from this entire process. Queued to fire when the TUI weak-fixed-point loop terminates: a consolidation pass over the entire arc - the rebuild rounds, the consult phases, the documentation fixed-point loop, the audit/fix cycles, the day's ledgered findings and mechanisms (conservation proxy, worked-example supremacy, read-downs at every layer, blind-audit divergence evidence) - distilling durable lessons for the record, shaped for reuse rather than as a diary.

### `autoharn2 row 1135`

- **ts:** 2026-07-22 23:22:52.750714+02
- **kind:** decision
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:5`
- **verbatim statement:**

  > Corrected scope for the queued lessons-learned pass, maintainer clarification verbatim: I meant specifically for ui (even minor findings) since ui is what im the least experienced with. The consolidation therefore covers the UI arc exhaustively - every finding of every severity from all rebuild rounds, both consults, the audit/fix cycles, and the companion rules exercised, minors included, organized as durable UI lessons for a maintainer building UI experience - not the general process-mechanism lessons (those are already individually ledgered and stay where they are).

### `autoharn2 row 1136`

- **ts:** 2026-07-22 23:48:05.286477+02
- **kind:** finding
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:181`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:553`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:583`
- **verbatim statement:**

  > Maintainer bench finding on the cycle-2 tree, recorded separately while the cycle-3 blind auditor runs (deliberately not injected, his words: Lets not bias the reviewer): the principals submenu after the master-detail restructure is completely broken in many ways - literally non-functioning, adding a principal is a no-op - independent of any genre question. Standing question for the post-cycle RCA regardless of what cycle 3 finds: the fix rounds own Pilot witnesses (case 10a-10e) claimed adds, nested adds, cascade and isolation all WITNESSED green - a live-terminal no-op behind green harness witnesses is the witness-surface gap class again (rows 1102, 1119), now on the delta the witnesses were specifically written for. Whether the blind auditor independently finds the breakage is itself evidence about audit adequacy, as in row 1131.

### `autoharn2 row 1137`

- **ts:** 2026-07-23 00:57:43.335052+02
- **kind:** decision
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1225`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1235`
- **verbatim statement:**

  > The TUI weak-fixed-point loop CONVERGED at cycle 4: blind audit verdict MAJOR ABSENT after four cycles (majors per cycle: 2 witnessed classes at cycle 1, 2 at cycle 2 including Rule 4s own minting specimen, 2 at cycle 3 plus the maintainers live no-op resolved to two root causes, 0 at cycle 4). One minor survives - cancel-grain during rehearsals long subprocess window - fixed in the closing minors round now running. The cycle-4 auditor also disclosed withdrawing its own false-major after finding the error in its harness driving, the audit discipline holding against itself. Series complete at ~/autoharn_series cycles 1-4 with runnable trees; the UI lessons consolidation (row 1135) fires when the closing round lands; merge to main and the maintainers bench remain the final acts.

### `autoharn2 row 1138`

- **ts:** 2026-07-23 01:02:48.614567+02
- **kind:** finding
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:36`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:65`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:600`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1227`
- **verbatim statement:**

  > Maintainer major on the converged cycle-4 state, from his screenshot at 251-column width, his words: I have to scroll just to find action surfaces, instead of the UI leveraging hierarchical design and using a scrollable text component situated next to each action surface. Named per his request: content/chrome separation violated (controls belong to stable always-visible regions, only content scrolls), progressive disclosure absent (reference prose fully expanded inline in the primary flow), and available width unused (a single 78-col ribbon on a 251-col screen - the measure is a prose line-length rule, not a one-column layout mandate). Genre solution is his own proposal: elucidation in an independently-scrollable help region beside the compact control column at wide widths (Qt Creator docked help, SAP F1 panel idiom), collapsing to on-demand disclosure at narrow widths. Loop reopens per its own weak-fixed-point rule - a fresh major after convergence is a new cycle, whoever finds it.

### `autoharn2 row 1139`

- **ts:** 2026-07-23 01:55:05.799681+02
- **kind:** finding
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:66`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:504`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:512`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:532`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1196`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1228`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1235`
- **verbatim statement:**

  > Cycle-5 maintainer major from screenshots: after adding a competence, the master-detail block renders the item then a phantom vertical expanse - remaining sub-lists and Add buttons pushed below a huge blank region (his scrollbar observation: scrolling eventually reaches another Add Competence), reading as adding-removes-all-abilities. ADR-0000 conviction recorded at his request: the class is container-height-claims-decoupled-from-content-size (Textual fr defaults in recomposed nested containers), now at its THIRD instance (round-5 overlap, cycle-3 starvation, cycle-5 expanse) each patched locally without naming the class; the operational lapse is instance-anchored witnesses - the fixture suite is a museum of past incidents with no global invariant, so every layout change can remint the class where no case looks. Mechanisms commissioned: one typed layout primitive giving content containers auto-height by construction with raw fr in content paths refused by the purity gate, and a global post-interaction layout invariant (blank-gap budget between actionable widgets, container virtual height vs children sum) checked after every Pilot step in every fixture.

### `autoharn2 row 1140`

- **ts:** 2026-07-23 02:50:56.32014+02
- **kind:** finding
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:224`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:311`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1081`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1145`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1163`
- **verbatim statement:**

  > Cycle-7 blind audit verdict MAJOR present, one finding, the optimistic-lie class the companion C5 predicted: steps.py commit() computes the real outcome then returns hardcoded ok=True, so the interactive app always exits 0 with a green Finish even as its own checklist reads REFUSED and COMMIT HALTED - witnessed against a genuinely failed live birth; the headless from-config path checks commit_halted correctly, the two paths drifted (P1: one fact, two homes). Also from the same audit, SEPARATE from the TUI: a real non-dry birth against toy at 192.168.122.1 failed mid-chain at s15-schema.sql line 80 with ON CONFLICT no-matching-constraint, leaving world cyc7w7528 as residue - the teardown requires force-non-scratch, classifier-blocked for both auditor and orchestrator, routed to the maintainer as an operator command. The s15 failure itself is a candidate birth-chain defect needing its own investigation.

### `autoharn2 row 1141`

- **ts:** 2026-07-23 02:50:56.564583+02
- **kind:** work_opened
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1163`
- **verbatim statement:**

  > work_opened: s15-birth-onconflict -- Investigate the cycle-7 witnessed birth failure: bootstrap/new-project.sh against toy at 192.168.122.1 for a fresh world died at s15-schema.sql:80 ON CONFLICT no unique or exclusion constraint matching - determine whether this is a birth-chain defect (fresh-schema chain broken at s15 on some path), an environment interaction (existing DB state), or a scaffold-arg issue from the TUI's non-dry commit; reproduce on a scratch schema first; kernel-adjacent so any fix routes through the standard ceremony.

### `autoharn2 row 1142`

- **ts:** 2026-07-23 03:14:54.766931+02
- **kind:** decision
- **citing sites:**
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:53`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1192`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1228`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1235`
  - `law/adr/history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md:1244`
- **verbatim statement:**

  > The TUI weak-fixed-point loop re-converged at cycle 9 with ZERO findings at any severity from a fresh blind auditor driving state combinations beyond the regression suite. Nine cycles total, two convergence claims reopened by maintainer bench findings along the way, eleven majors killed: UI-thread freeze, seeding invisibility, Rule 4s minting specimen, config-load silent drops, selection affordance absent, layout squeeze, phantom expanse (class closed by typed layout primitives plus an always-on invariant), silent cascade delete, commit-success lie (two sites), plus the s15 birth-chain failure surfaced as a canary (open row 1141). Terminal gate remains the maintainers bench on the cycle-8 tree; the postmortem field guide (rows 1134/1135) is commissioned now per his standing instruction.

### `autoharn2 row 1174`

- **ts:** 2026-07-23 09:54:09.8257+02
- **kind:** decision
- **citing sites:**
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:108`
- **verbatim statement:**

  > Maintainer refinement of the review fixed-point protocol 2026-07-23, near-verbatim: apply the weak fixed-point condition on each axis independently - axes that converge drop out of the race; an axis that came back decently compliant is trusted fairly rather than re-run on principle (his framing: ADR-0012-style compliance with nothing disgraceful shouldn't need another pass; part token-thrift, part declared laziness-and-impatience, both legitimate). Bound: after the combined fix round, each review axis gates independently - a targeted fresh re-check scoped to that axis' fixes plus a brief fresh sweep of the same lens; an axis re-checking severe-free CONVERGES and exits; only unconverged axes iterate further; no more full-everything passes once an axis has dropped out. Round 2 for the retirement review = three targeted re-checks (all three axes carried severes in round 1), each terminating on its own clean pass.

### `autoharn2 row 1177`

- **ts:** 2026-07-23 10:40:15.911791+02
- **kind:** finding
- **citing sites:**
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:108`
- **verbatim statement:**

  > Retirement review round 2 verdicts under per-axis convergence: STRUCTURAL converged (severe absent; two disclosed minors - the cross-boundary regex twin-home and a justified parser-shape duplication - logged for hygiene); GRAMMAR converged (severe absent; fresh adversarial probes beyond the fixes all clean; the exit-4 usage convention confirmed pre-existing, consistent, and disclosed); FAITHFULNESS iterates with one new SEVERE of the same wrong-fact-written class through the VALUE side - flags.get or-default on declare/undeclare-standing silently substitutes the default role on an empty-valued --db-role and writes standing for the wrong role, where legacy's accidental crash wrote nothing. Targeted fix dispatched (empty-valued recognized flags refused as a disclosed improvement over the crash; fallback-pattern sweep across all ported verbs); the faithfulness lens re-runs alone after it lands.

### `autoharn2 row 1180`

- **ts:** 2026-07-23 11:38:44.511513+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0000-the-alpha-and-the-omega-type-driven-design.md:624`
  - `law/adr/0002-fail-loudly.md:394`
  - `law/adr/0003-domain-coupling-bands.md:220`
  - `law/adr/0004-minimal-touch-edits-to-partially-visible-files.md:165`
  - `law/adr/0005-documentation-discipline.md:326`
  - `law/adr/0006-source-file-headers.md:208`
  - `law/adr/0007-file-size-and-information-density.md:185`
  - `law/adr/0008-classification-discipline.md:303`
  - `law/adr/0013-execution-integrity.md:559`
  - `law/adr/0014-executor-second-opinion.md:494`
  - `law/adr/README.md:197`
  - `law/adr/README.md:210`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:98`
- **verbatim statement:**

  > Maintainer instructions before duty-and-sleep 2026-07-23, near-verbatim: commit and push so the work is preserved regardless of tagging (DONE - main at 5e2e052, pushed); fix the Opus laundry list - I'll vest judgement for you to act on the Opus review; residue and version bump when he returns, nothing sounded release-blocking. Orchestrator scope under vested judgment: Tier 1 all four (README says what autoharn is with correct links, QUICKSTART derives lineage live instead of frozen-at-s15, one page owns the deployment model with pinned-submodule as the 2.0 default, led help opens with usage), Tier 2 all five (TUI becomes THE getting-started path, one canonical start-here, operator remedies replace Python internals in doctor and gate text, FAQ reindexed by operator intent with generation tags parenthetical, one canonical verb roster), Tier 3 cheap-and-safe (vestigial links, WALKTHROUGH ref, PGHOST variables, attest markers to file bottom, new-project usage derived from its own manifest, law adr README index, provenance list-not-paragraph) plus the sweeps two flagged hazards (config_seam stale docstring, FAQ teletype paragraph). DEFERRED to the maintainer: ADR-0019 dual-numbering (law naming is his), root-directory restructure (many citations, risky, proposal noted instead). ADR-0020 governs the rewrites: claims verified against the tree mechanically, cold-read pass follows the build. Incidental: this checkouts own deployment.json gained its boundary keys just now - the first led write through the served path on main, this row itself.

### `autoharn2 row 1228`

- **ts:** 2026-07-23 14:54:23.63569+02
- **kind:** finding
- **citing sites:**
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:205`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:216`
- **verbatim statement:**

  > Umbrella build (Sonnet a73d1489, salvaging worktree ab74a35e's mechanical libexec relocation) landed at worktree commit 3d2043e: dispatcher + generated --help, ensure-running with bind-as-lock (builder caught+fixed a real TOCTOU in its own first draft), version handshake wired into led/pickup/distance-to-clean/asof-export, world_descriptor write/scan, alias shims, 3 new seen-red fixtures, gates green. HONESTLY PARTIAL per the builder's own stop-and-name: (a) hub consolidation of live 8433/8422 NOT done -- live-host surgery routed to orchestrator/maintainer rather than done unilaterally from a worktree; (b) new-project.sh birth wiring for descriptors + scaffold transition to umbrella shape NOT done (1200-line load-bearing script, deliberate follow-on); (c) led --dry-run NOT built (substantial separate piece); (d) pre-existing gap FLAGGED: judge/verify-chain/distance-to-clean/audit --help require a resolvable deployment.json before printing usage, against row 1159's letter; (e) doctor-on-newborn UNEXERCISED (worktree has no deployment). Per the per-axis weak fixed-point protocol (rows 1124/1174/1177) five fresh blind refute-prompted Sonnet reviewers dispatched before merge: relocation/dispatch parity, ensure-running concurrency, handshake client coverage, witness-plan honesty, docs/law conformance. Merge only after all axes drop out severe-free; follow-on work items to be opened for a-d at merge time.

### `autoharn2 row 1229`

- **ts:** 2026-07-23 14:56:29.508244+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:320`
  - `law/adr/backlog/README.md:22`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:45`
- **verbatim statement:**

  > Maintainer ruling 2026-07-23, near-verbatim: 'I think that all of these code-touching work probably should be reviewed, we've been more lax than appropriate in that regard recently. I'm especially worried about anything touching a hook without seeing a second pair of eyes, since (very very early, weeks ago maybe) a broken hook was observed.' Standing effect: EVERY code-touching delivery gets a fresh-context adversarial review before merge regardless of size (docs-only batches may still merge on orchestrator diff review); anything touching hooks/ ALWAYS gets a dedicated second-pair-of-eyes review on top of the session-gap merge gate. Applied retroactively this hour: post-merge blind review dispatched for the already-merged bootstrap trio commits 29ed250+d211165 (any severe becomes a fix-forward), dedicated hook review dispatched for the parked a7a5819 before it may merge, fresh review dispatched for the engine-pair commit d5f809e; the umbrella build was already under the five-axis fixed-point protocol.

### `autoharn2 row 1230`

- **ts:** 2026-07-23 15:02:03.474265+02
- **kind:** finding
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:70`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:85`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:99`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:172`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:187`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:244`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:255`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:269`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:320`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:333`
- **verbatim statement:**

  > Review round under the maintainer's tightened bar (row 1229), outcomes and dispositions. UMBRELLA (3d2043e), all five axes reported: 5 SEVERE total -- (1) dispatch-parity fixture never executes the umbrella path for a real verb (reviewer proved it by breaking the dispatcher's exec line, fixture stayed green); (2) ensure-running's TOCTOU fix is a 0.5s grace sleep, not structural -- loser can write a pidfile naming a process that dies moments later, leaving the real winner unstoppable; (3) service stop SIGTERMs the pidfile PID with no identity check (PID reuse kills a bystander); (4) probe adopts ANY HTTP responder incl. 404 despite its own docstring claiming a health-shape check, and ensure-running is wired into no verb (spec section 2 commitment unbuilt); (5) CLAUDE.md operator-surface sentence unscoped -- false for every newborn world, contradicted by its own sibling edit, ADR-0020 class -- plus a hand-typed ten-verb roster reopening the count-drift seam. Minors: world_descriptor docstring claims fixtures that do not exist anywhere; handshake red.txt not a genuine pre-fix red; nested-help verification overclaimed; exit-4 collision (mismatch vs unreachable) vs the docstring's disjointness principle; mid-invocation handshake-cache window (proven by the fixture's own case c); spec section 6 doc sweep under-delivered (USER-GUIDE/README untouched). Axes 3+4 dropped out severe-free. Fix round 1 dispatched to the umbrella worktree with orchestrator decisions: exit-4 sharing kept-and-documented; cache window documented operator-visibly, no invalidation machinery; ensure-running verb wiring directed with stop-and-name permission. TRIO post-merge review (fe567e6): 1 SEVERE CONFIRMED AGAINST THE REAL ~/ent -- convert-to-submodule.sh now requires asof-export (added 2026-07-18) so every older real deployment incl. the script's own motivating case refuses with a misleading not-a-scaffold text; the doctor carve-out chronology applied to everything except the verb that needed it. Plus the gitignore marker-presence idempotence check confirmed by simulation: --force against an old block reports idempotent while the stamp secret stays un-ignored. Sourcing/quoting/fixture-weakening refutations all held. Fix-forward dispatched (isolated worktree, will be reviewed before merge). ENGINE review (d5f809e, unmerged): traversal refactor verified behavior-preserving by live execution, BUT 2 SEVERE -- the new deep-walk gate is invoked by NOTHING (pre-commit never runs it; mechanical-enforcement claim false as delivered) and false-passes superclass catches (except RuntimeError, demonstrated exit 0). Fix dispatched into the same worktree; the pre-commit wiring touches hooks/ so its MERGE is session-gap-gated like a7a5819. HOOK commit a7a5819 review: NOTHING SEVERE (direct execution of _render against zero/negative/tiny caps and multibyte straddles -- no raise path; parity arithmetic identical across all three renderers; truncation loud); one minor: apparatus.json byte_cap note stale, folded into the gap-merge.

### `autoharn2 row 1231`

- **ts:** 2026-07-23 15:04:04.620667+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:151`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:45`
- **verbatim statement:**

  > Maintainer ratification 2026-07-23: weak fixed-point review is the STANDING convergence criterion for all code-touching work (extends row 1229's every-delivery-gets-fresh-eyes rule), 'or slightly stronger perhaps if you judge it reasonable' -- the strengthening left to orchestrator judgment. Orchestrator's chosen calibration, on the record: DEFAULT (weak) -- fresh blind refute-prompted reviewer per axis per lap, fixes red-first between laps, an axis drops out when a lap finds no SEVERE; small single-surface diffs are one axis, large passes get per-axis panels. STRENGTHENED TIER for the surfaces where a silent wrong answer costs most -- kernel/lineage, hooks/, serving/ (the live write path), bootstrap scaffolding that stamps real deployments, and anything credential-adjacent: an axis drops out only on a lap with no severe AND no moderate finding of the silent-wrong-answer class (silent misparse, wrong-target action, false-success reporting); moderates of the loud-and-honest class do not hold an axis open. Rationale for drawing the line there: this session's own evidence -- the trio's asof-export regression and gitignore false-idempotence were both merged-then-caught bootstrap-tier defects of exactly the silent-wrong-answer class, while the umbrella's exit-code-collision minor is loud-and-honest and would be wasteful to iterate on. Judgment stays judgment: the orchestrator may promote any review to the strengthened tier at dispatch time and says so in the brief when doing so.

### `autoharn2 row 1232`

- **ts:** 2026-07-23 15:13:02.757074+02
- **kind:** work_claimed
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
- **verbatim statement:**

  > work_claimed: experience-secret-gitignore-hazard

### `autoharn2 row 1233`

- **ts:** 2026-07-23 15:13:03.02601+02
- **kind:** finding
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:333`
- **verbatim statement:**

  > Trio fix-forward bea252f CLEARED at strengthened tier (fresh blind lap, row 1231 protocol) and merged 40439f1, pushed: convert-to-submodule discovers on the original eight with asof-export/doctor folded in when present (the disagreeing-optional-verb case witnessed refusing correctly), missing-verb refusal teaches the byte-accurate shim shape + re-scaffold hatch; gitignore idempotence is content-aware (missing scaffold-owned lines appended inside the marker block once, loudly; corrupted begin-without-end marker aborts loudly with file untouched -- MODERATE-loud residual: raw traceback rather than teaching text, non-blocking, noted for next touch). Reviewer also caught a stray zero-byte tracked file 'gates/fixture_census.py)' from 15fdb4f -- removed, 5b29c4b. The GENERALIZE half of experience-secret-gitignore-hazard (scaffold gitignores the secret dir by default + heals old blocks on --force) is now fully shipped; the item's remaining half is the maintainer's own shell act on the live experience/panel repos, which stays his.

### `autoharn2 row 1234`

- **ts:** 2026-07-23 15:16:11.122128+02
- **kind:** work_opened
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:15`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:116`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:195`
- **verbatim statement:**

  > work_opened: gates-staged-vs-tree-blindness -- Discovered by the engine-gate strengthened-tier re-review (row 1230 arc): gates invoked by hooks/pre-commit read the WORKING TREE (path.read_text) rather than the staged INDEX (git show :path), so the ordinary stage-then-keep-editing workflow produces silent false-success -- the hook checks different bytes than the commit embeds. Reproduced live against deep_walk_recursion_guard; instrument choice inherited from no_lazy_imports.py (same pattern), so the WHOLE gate chain needs a census: for each blocking gate determine whether it reads tree or index, and either convert to index-reading (git show :path / git diff --cached scope) or document loudly why tree-reading is correct for that gate (e.g. gates that census repo layout rather than file content). The deep-walk gate itself is being fixed index-aware in its own branch; this item is the REST of the chain. Bootstrap/hooks tier: strengthened-tier review on the fix.

### `autoharn2 row 1235`

- **ts:** 2026-07-23 15:25:38.038489+02
- **kind:** work_opened
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:9`
- **verbatim statement:**

  > work_opened: review-campaign-postmortem -- Maintainer commission 2026-07-23, verbatim: 'I'd ask for a post-mortem across the findings when all is said and done, for (process improvement? sorry, you said what it was called, quality improvement or something), to see whether there's any durable lessons learned we haven't already banked (and given the amount of finding, we shouldn't require there to be a durable lesson beyond what we already have -- but, on the other hand, let's not be conceited either)'. Scope: the 2026-07-23 review campaign under rows 1229/1231 -- umbrella five-axis panel + fix rounds, trio post-merge review + fix-forward, engine-gate three-lap series, hook a7a5819 review, plus the docs/scout batches. Shape per the house postmortem practice (history/POSTMORTEM-SETUP-TUI-ARC precedent + the ops_improvement four-question frame: missing project-agnostic directives? should they enter law? are existing ADRs unclear/insufficiently generic? unknown-unknowns): findings classified against existing banked lessons/ADRs; a durable lesson is REQUIRED to be beyond what's already banked or explicitly recorded as already-covered -- neither forced novelty nor conceited nothing-to-learn. Candidate seeds already visible, to be tested against the banked set, not presumed novel: staged-vs-tree gate blindness (row 1234) as a possible instance of a wider 'the check must read what the act embeds, not what the eye sees' principle; the cosmetic-fix class (TOCTOU grace-sleep -- a fix that narrows a race is not a fix); the doctor-carve-out-chronology miss (a compatibility carve-out granted to one late verb but not the other with identical chronology); fixture-cannot-catch-its-claim recurrence despite ADR-0020/witness discipline. Sequenced AFTER: umbrella fixed-point converges + merges, engine series clears + gap-merge, fixture-repairs batch lands. Fable-authored analysis; the classification sweep may be Sonnet-assisted.

### `autoharn2 row 1236`

- **ts:** 2026-07-23 15:31:29.564598+02
- **kind:** finding
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:255`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:283`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:369`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:188`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:201`
- **verbatim statement:**

  > Engine deep-walk series CONVERGED: lap 3 CLEARED at strengthened tier (staged-read path attacked incl. staged-deletes/renames/spaces/no-repo -- all loud; both staged/tree divergence directions witnessed correct; no unnamed evasion within one step; behavior preservation re-verified live). Lap-3's two loud moderates fixed on-branch as comment/docstring-only c89be38: pre-commit chain comment now names the DELIBERATE staged-read divergence from tree-reading neighbors with a do-not-harmonize warning (guards against a future editor reintroducing the silent false-success), and the docstring stops claiming a git-absent fallback that does not exist. MERGE HELD AT THE PERMISSION LAYER: the orchestrator judged the maintainer's absence a session gap and attempted the atomic merge (d5f809e..c89be38); the harness classifier refused hooks-touching merges to the orchestrator -- accepted as the correct mechanical enforcement of the standing hooks rule, not worked around. The gap-merge queue is now a PREPARED OPERATOR ACT, two commands, ready verbatim in the session transcript: (1) atomic merge of worktree-agent-ab5c44e08e7509c1a (deep-walk series; ATOMICITY: all four commits together, the wired gate requires d5f809e's helper); (2) merge of a7a5819 (byte-cap parity, review-cleared) from worktree-agent-a747755bf8e15ea67 plus the one-line apparatus.json byte_cap note fix. Both triple-witnessed; nothing else in the queue touches hooks.

### `autoharn2 row 1237`

- **ts:** 2026-07-23 15:48:57.381318+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:21`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:232`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:51`
- **verbatim statement:**

  > seen-red-artifact-claim-dereference-guard-1784814536: dead evidence path probe

### `autoharn2 row 1238`

- **ts:** 2026-07-23 15:48:58.351743+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:21`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:232`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:51`
- **verbatim statement:**

  > seen-red-artifact-claim-dereference-guard-1784814536: bare directory evidence probe

### `autoharn2 row 1239`

- **ts:** 2026-07-23 15:48:58.94288+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:21`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:232`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:51`
- **verbatim statement:**

  > seen-red-artifact-claim-dereference-guard-1784814536: live file evidence probe

### `autoharn2 row 1240`

- **ts:** 2026-07-23 15:48:59.777056+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:21`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:232`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:51`
- **verbatim statement:**

  > seen-red-artifact-claim-dereference-guard-1784814536: explicit trailing-slash directory probe

### `autoharn2 row 1241`

- **ts:** 2026-07-23 15:49:00.589732+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:21`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:232`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:51`
- **verbatim statement:**

  > seen-red-artifact-claim-dereference-guard-1784814536: about to write /tmp/does-not-exist-nbdr-statement-probe next

### `autoharn2 row 1242`

- **ts:** 2026-07-23 15:49:01.408844+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:21`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:232`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:51`
- **verbatim statement:**

  > seen-red-artifact-claim-dereference-guard-1784814536: about to write /tmp/does-not-exist-nbdr-multi-a and /tmp/does-not-exist-nbdr-multi-b then ./tmp/does-not-exist-nbdr-multi-c across three separate files

### `autoharn2 row 1243`

- **ts:** 2026-07-23 15:49:02.204471+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:21`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:232`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:51`
- **verbatim statement:**

  > seen-red-artifact-claim-dereference-guard-1784814536: row:1 citation untouched probe

### `autoharn2 row 1244`

- **ts:** 2026-07-23 15:49:02.43273+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:21`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:232`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:51`
- **verbatim statement:**

  > seen-red-artifact-claim-dereference-guard-1784814536: https://example.com/nbdr-probe untouched

### `autoharn2 row 1245`

- **ts:** 2026-07-23 15:51:07.52796+02
- **kind:** work_opened
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:118`
- **verbatim statement:**

  > work_opened: led-rebase-evidence-guard-loss -- SEVERE-class hazard from the fixture-repairs pass (batch a74978e0): the rebased served led.tmpl appears to have entirely LOST the --evidence artifact-dereference guard and the path-shaped-statement warning that the legacy CLI carried -- seen-red/artifact-claim-dereference-guard reports SPECIMEN INERT: the behaviors it exists to witness no longer exist to exercise. This is a rebase feature-loss (the class the full-surface differential should have caught -- also a postmortem seed, row 1235): a claim citing an artifact hash is no longer checked against the artifact store, and a path-shaped statement no longer warns. Repair: reimplement both guards in the served path (boundary or CLI layer per the original spec seen-red/artifact-claim-dereference-guard cites), red-first against the revived fixture. Strengthened tier.

### `autoharn2 row 1246`

- **ts:** 2026-07-23 15:51:07.758676+02
- **kind:** work_opened
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
- **verbatim statement:**

  > work_opened: led-decision-help-garbage-gap -- Re-discovered by the led-help-token-closure fixture rebuild (batch a74978e0): bare 'led decision help' still commits the literal statement 'help' as a ledger row -- the garbage-statement guard (row 1159 arc) does not cover the help-token-as-statement case in the rewritten CLI. The rebuilt fixture names the gap rather than silencing it. Repair: extend the garbage/help-token classifier to refuse bare help-like statements on write verbs with teaching; red-first against the fixture's named case.

### `autoharn2 row 1247`

- **ts:** 2026-07-23 15:51:07.993024+02
- **kind:** work_opened
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
- **verbatim statement:**

  > work_opened: s25-ledger-differential-floor-bug -- Found during s25-commission-kind repair (batch a74978e0), pre-existing and NOT fixed there: ledger_differential's auto-detect 'work' floor query is incompatible with an s15..s25-only schema (the exact chain shape s25's own fixture scaffolds). Diagnose whether the differential should degrade gracefully on pre-work-ledger chains or the fixture should pin a compatible floor; the differential is a judge input so a wrong floor is potentially a silent-wrong-answer -- strengthened tier on the fix.

### `autoharn2 row 1248`

- **ts:** 2026-07-23 15:53:35.32249+02
- **kind:** finding
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:232`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:52`
- **verbatim statement:**

  > FIXTURE LEAK -- rows 1237 through 1244 are GARBAGE, written into this real kernel by the seen-red/artifact-claim-dereference-guard fixture (probe tag seen-red-artifact-claim-dereference-guard-1784814536) during the fixture-repairs batch a74978e0: the fixture's led resolution reached this deployment's live boundary instead of a scratch world. All eight are content-free probes (evidence-dereference and path-shaped-statement probes); no reader should credit them as decisions of this project. This is the exact hazard class the maintainer named from the SPA arc (implementer agents writing --help rows into the live ledger) and the reason he has been afraid to touch led himself -- now witnessed surviving into the served era. Dispositions: (a) the running batch reviewer has an addendum to determine whether the COMMITTED fixture still resolves to the real deployment (if so it blocks the commit); (b) wrong-target ledger writes from fixtures join row 1235's postmortem seeds -- 'zero residue' claims that check filesystem and processes but not the KERNEL are a false-clean; (c) a structural guard (fixtures pinned to scratch deployments by construction, or the boundary refusing a fixture-tagged principal) belongs in the repair of row 1245-1247's family. No row-level supersession verb exists for plain decision rows -- this defeating finding is the available mechanism; if a typed retraction lands later it should cite this row.

### `autoharn2 row 1249`

- **ts:** 2026-07-23 15:53:50.958517+02
- **kind:** work_opened
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:86`
- **verbatim statement:**

  > work_opened: fixture-scratch-pinning-guard -- From the row-1248 fixture leak (probe rows 1237-1244 written into the real kernel by a seen-red fixture): fixtures that exercise led/boundary must be UNABLE to reach a real deployment by construction, not by cwd-luck. Candidate shapes (builder picks with review): every fixture resolves deployment via an explicit scratch path env (PICKUP_DEPLOYMENT pinned in the fixture harness, never inherited); and/or the shared serve_existing_world helper refuses a deployment.json whose schema/kern matches a registered real deployment; and/or the boundary refuses writes from a fixture-tagged principal. Also NAMED, routed constitutional (kernel delta, Fable spec + maintainer): no typed retraction exists for plain ledger rows -- the leak could only be marked by a defeating finding (row 1248), not retracted; a typed row-retraction event in the s57 pattern may be worth its own spec, maintainer's call whether the ceremony is warranted. Strengthened tier on the guard's build.

### `autoharn2 row 1250`

- **ts:** 2026-07-23 15:56:50.004763+02
- **kind:** finding
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:100`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:130`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:188`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:383`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:216`
- **verbatim statement:**

  > Umbrella lap 2 outcomes: docs axis CLEARS and drops out (two-roster claim verified true against the tree and legible in all five doorway docs; cache-window paragraph accurate; no ADR-0020 drift). Parity axis BLOCKS: wrong-target dispatch -- a verb file carrying another verb's implementation passes every fixture case with plausible output and exit 0 (the exact relocation-commit risk class); plus dispatcher comment misattributes what case f witnesses. Ensure-running axis BLOCKS: straggler spawn_and_wait unconditionally unlinks the WINNER's live pidfile (witnessed live: healthy service left unstoppable via service stop -- breaks the control surface under the exact many-sessions-is-the-norm pattern of row 1165); plus a silently-swallowed FileExistsError leaving a wrong-pid pidfile with zero diagnostic; plus a measured-false backlog comment. Round-1's structural fixes held everywhere else: listen()-as-lock single-listener witnessed, stop identity checks correct incl. cross-world plant, detachment clean, fixtures g-j pass. Combined fix round 2 dispatched (one pass, both axes). The lap-2 finds are new defect instances, not round-1 residue -- the fixed-point protocol is doing its job: each lap's fresh eyes found classes the prior lap's fixes did not cover.

### `autoharn2 row 1251`

- **ts:** 2026-07-23 16:02:02.187354+02
- **kind:** finding
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:232`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:307`
- **verbatim statement:**

  > Fixture-repairs batch review: BLOCKS. Commit 441d255 SEVERE confirmed structural -- artifact-claim-dereference-guard is DESIGNED to drive the repo-root led against the live deployment (its own docstring says so); rows 1237-1244 attributed exactly to its eight probes; every future acceptance run would leak again. Commit b709b45 MODERATE-silent: no try/finally around serve_existing_world..stop_server in led-help-token-closure (exception leaks the service + skips scratch teardown). Commit 63bbd85 (led.tmpl supersedes-before-work fix) CLEARS at strengthened tier: correct against the token-iteration grammar, explicit precedence, no scope creep, witnessed live via s31's non-tautological advisory pin; one MINOR pre-existing adjacent gap (claim/list/violations/asof still silently drop a front-anchored supersedes flag -- no refusal). Six remaining commits clear. Fix round dispatched: rewire the leaking fixture onto scratch with named-gap assertions (inert specimen pending row 1245), try/finally repair, defensive tempdir-only refusal in serve_existing_world citing the leak incident, and an attribution correction (claimed s29/s30 case retirements not found in the commit range -- record must end accurate).

### `autoharn2 row 1252`

- **ts:** 2026-07-23 16:30:07.169845+02
- **kind:** work_claimed
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
- **verbatim statement:**

  > work_claimed: cli-rebase-fixture-repairs

### `autoharn2 row 1253`

- **ts:** 2026-07-23 16:30:07.42356+02
- **kind:** finding
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:233`
- **verbatim statement:**

  > cli-rebase-fixture-repairs merged ae2e607 after full review cycle (rows 1251 arc). Delivered: 15 fixtures revived green on the shared serve_existing_world scratch pattern; led.tmpl supersedes-before-work regression fixed (strengthened-tier cleared); the leaking fixture rewired to scratch with named-gap assertions pending row 1245; harness leak-proofed structurally (tempdir + repo-containment refusals citing rows 1237-1244/1248; try/finally lifecycle verified by injected-failure witness). HONESTLY PARTIAL, reasons on record: ~27 fixtures remain red for named structural reasons -- track-work.sh chains cap at s25 by design (dominant, ~15 fixtures, gated on the maintainer's track-work-boundary decision row 1169); genuine pre/post-s43 isolation tests have no write path post-retirement (needs a validated raw-SQL witness helper or view-comparison technique, a real follow-up commission); pickup/hooks-rebase broke connection-simulation techniques for 5. Open hazards already itemized: rows 1245 (evidence-guard absent from rebased CLI), 1246 (bare help-token garbage write), 1247 (s25 differential floor).

### `autoharn2 row 1254`

- **ts:** 2026-07-23 16:30:07.712077+02
- **kind:** work_closed
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
- **verbatim statement:**

  > work_closed: cli-rebase-fixture-repairs (shipped)

### `autoharn2 row 1255`

- **ts:** 2026-07-23 16:54:50.585364+02
- **kind:** finding
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:102`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:383`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:216`
- **verbatim statement:**

  > Umbrella fixed-point progress: ensure-running axis CONVERGED at lap 4 (CLEARS) -- double-reclaim proven structurally impossible by forcing a real OS-level bind race (listen() is the exclusivity gate); every adopted-verdict path probe-gated, verified at all four return sites; the three admitted code-review-only paths each manually forced and shown to degrade loudly, never silently. Two narrow residuals on record, non-blocking: permission-denied /proc reads conflated with not-live (single-operator model makes it near-unreachable; bookkeeping-only loss), and the 10s poll timeout vs 65s HTTP timeout mismatch if /health ever grows a slow dependency (self-heals to adopted; first invocation would see a spurious loud failure). Docs axis converged lap 2; parity axis at lap 4 with ONE remaining severe, notably narrower each lap (whole-fixture absence -> content swap -> shared refusal boilerplate -> served/legacy sibling marker collision on distance-to-clean): sibling templates print identical usage lines so a served-for-legacy exec swap passes the suite. Fix round 5 dispatched (distinguishable markers reusing each template's own self-description, fixture pins the contractual legacy target and asserts the served marker ABSENT, plus a sweep for other served/legacy sibling pairs in reach -- pickup has one). Targeted lap 5 follows; merge on its clear.

### `autoharn2 row 1256`

- **ts:** 2026-07-23 17:04:17.59961+02
- **kind:** work_claimed
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
- **verbatim statement:**

  > work_claimed: umbrella-cli

### `autoharn2 row 1257`

- **ts:** 2026-07-23 17:04:17.943633+02
- **kind:** finding
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:205`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:216`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:353`
- **verbatim statement:**

  > Umbrella CLI MERGED 243cef5 and LIVE: five-lap per-axis fixed point converged (rows 1228/1230/1250/1255 arc); the standing 8433 service was running pre-handshake code -- the new led correctly REFUSED it with the version-skew teaching (the handshake's first live catch, on our own host, minutes after merge) and doctor's new pidfile-consistency line correctly named it an unrecorded winner. Followed doctor's own taught recovery verbatim: identified pid via ss, stopped the old service, autoharn service start spawned the new code with proper pidfile. doctor now 0 FAIL 7 PASS with pidfile-consistent PASS; led answers through both the alias (with deprecation line) and autoharn led. Remaining spec scope on record as named follow-ons: new-project.sh scaffold transition to umbrella shape + descriptor birth-wiring (deliberate, spec section 6 one-window transition governs), hub consolidation of 8422 (operator-adjacent), led --dry-run (row 1159 remainder), missives s58/s59 awaiting spec ratification.

### `autoharn2 row 1258`

- **ts:** 2026-07-23 17:04:18.344224+02
- **kind:** work_closed
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
- **verbatim statement:**

  > work_closed: umbrella-cli (shipped)

### `autoharn2 row 1259`

- **ts:** 2026-07-23 17:06:18.833223+02
- **kind:** work_claimed
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
- **verbatim statement:**

  > work_claimed: review-campaign-postmortem

### `autoharn2 row 1260`

- **ts:** 2026-07-23 17:06:19.23466+02
- **kind:** work_closed
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:11`
  - `law/adr/backlog/CONSULT-ADR-0021-REVIEW-CONDUCT-APPENDIX-2026-07-25.md:28`
- **verbatim statement:**

  > work_closed: review-campaign-postmortem (shipped)

### `autoharn2 row 1429`

- **ts:** 2026-07-26 13:40:13.908871+02
- **kind:** finding
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1182`
- **verbatim statement:**

  > Fixture-sweep triage complete (sweep agent report, merged base 8100e42 + tooling commit babcd5e on its worktree branch, not merged): 182 families -- 135 GREEN, 45 RED, 2 UNEXERCISED. Triage: (a) genuine divergence dominated by TWO shared root causes -- fixture scaffolding helpers omit --boundary-url/--boundary-deployment so served led calls refuse (about 13 families), and engine ledger_differential layer_capability() lacks a detection rule for the entitlement layer though lp_registry lists it (3 confirmed + 3 plausible families); plus individual well-evidenced items (extract-context world-name literal vs tightened WorldName, rename-doc missing _staged_read sibling copy, setup-tui-adr-synopsis-drift: 10 ADRs with stale declared sha256). (b) broken-by-named-merge, re-banking items: s61 fixture first-run defect, legacy-led-retirement w5/w6 cases vs s61 possession-proof tightening, verify-commission seeding-order vs s58-s61 tail, setup-tui-ceremony-chain-authorship TypeError in plan.py render() on tuple argv (live bug in just-merged code), setup-tui-config-file plan-key silent-loss regression, belief-substrate-v2 negative control now accepted (plausibly s62, unconfirmed). (c) environment: six setup-tui families crash without textual module (no clean refusal), 05-verify-adapter env var unset (refuses cleanly, sweep misclassifies), 42-gate-journal-registered structurally unrunnable. Monitor-notification failure investigated: grep pattern and timeout both verified correct; delivery failure in the notification infrastructure itself -- background-notification delivery is not guaranteed, idle waits on one are a hazard. High-leverage follow-ups: the two shared root causes are single-fix items each touching many families.

### `autoharn2 row 1430`

- **ts:** 2026-07-26 13:45:18.697585+02
- **kind:** finding
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1182`
- **verbatim statement:**

  > s61 kernel regression, witnessed on scratch (world s61probe1, torn down zero-residue): kernel/lineage/s61-signature-symmetry-and-key-binding.sql Element 7 re-issued validate_supersession_target from a STALE base -- it claims 'Base body = s45 (UNCHANGED by s60)' but s53 and s58 had each superseded that body -- so the CREATE OR REPLACE silently DELETED four refusal branches while adding the symmetry block. Relaxed act class at current head: (1) a belief is now supersedable by a different principal and by a different kind (holder-only self-revision discipline gone; live-witnessed accepted, and refused byte-identically once s58 Element 5 body re-applied -- bisect closes on s61); (2) missive_sent supersedable by anything; (3) missive_received supersedable at all (was unretractable history); (4) missive_disposed supersedable cross-kind/cross-regards. Missive legs established textually (branches absent from s61 body), UNEXERCISED live (newborn world_identity empty blocks missive writes upstream). s62 exonerated: it never touches this function. Surfaced by fixture belief-substrate-v2 NEG-cross-principal-supersession-refused in the row-1429 sweep. Process defect alongside: s61's false byte-identity claim survived its fresh-context review rounds -- exactly the drift the s45 head-body rule exists to prevent.

### `autoharn2 row 1432`

- **ts:** 2026-07-26 13:58:58.174343+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1224`
- **verbatim statement:**

  > Maintainer ruling 2026-07-26 on the re-issue drift class: all three remedies scheduled, done right over done fast, unless one forecloses needed features. (1) prior-body hash binding -- IN FLIGHT, folded into the s63 gate by spec section-3 amendment 2de8858, builder re-briefed. (2) witness-universe closure for whole-body re-issues -- STANDING RULE from this row forward: any delta re-issuing an existing function must enumerate the refusal branches of the ACTUAL prior head's body as its witness-plan quantification universe and witness each still-refusing post-delta; retires per function as (3) lands. (3) decompose validate_supersession_target (and any remaining monolithic multi-kind validator) into per-concern conjuncts on the s60/s62 entitlement pattern, so additive deltas are literally additive and whole-body re-issue ceases to exist -- SCHEDULED as its own future Fable-authored spec, sequenced after the v2 access-control arc; feature-foreclosure check is part of that spec's job.

### `autoharn2 row 1469`

- **ts:** 2026-07-27 13:46:43.106902+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0014-executor-second-opinion.md:481`
  - `law/adr/README.md:190`
- **verbatim statement:**

  > Layout ruling EXECUTED (maintainer 2026-07-27, '4b yes'): (1) gates/layout_census.py law/adr currency widened to NNNN-*.md + README.md -- the catalog README is directory convention, the same allowance kernel/lineage already carried; renaming law files to satisfy a gate regex would be the gate wagging the law. (2) RETROSPECTIVE-ADR-CROSSCHECK-2026-07-23.md relocated law/adr/ -> design/ via tools/rename_doc.py (sanctioned mover; content hash unchanged b935094..., no prior attestation to carry, file keeps its own doc-attest-exempt waiver) -- a dated record is not law. Three referents retargeted with dated mechanical notes: its own relative postmortem link, ADR-0014's dated-amendment citation (path-only retarget, amendment text otherwise verbatim), law/adr/README.md's catalog line. layout-census WITNESSED clean post-change; both prior PATTERN BREACHes from the sweep triage are resolved.

### `autoharn2 row 1539`

- **ts:** 2026-07-27 21:14:28.701723+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0008-classification-discipline.md:262`
  - `law/adr/0012-compositional-and-structural-hygiene.md:1236`
- **verbatim statement:**

  > s66/s67 fresh-context kernel review: CLEARS (row 1538 arc). All six targets personally re-witnessed by the reviewer: forgery-channel closure re-probed through the new code (a caller-minted write_refused with forged-complete stamp refuses BEFORE any INSERT, and only ledger_write's payload contract even admits a kind key -- the other six boundary functions structurally cannot reach the forgery channel); both prior-body hashes independently extracted and matched; the full fixture family, judge AGREE, and verify-chain INTACT+ORACLE-CONFIRMED reproduced; Idris LAGGING marker and the escalated attestation both verified honest. One MINOR transcribed (commit message names the wrong file for the backfilled s65 bullets; recorded, not reworked). MERGE HELD pending the maintainer's ruling on the one relaxation, which the review sharpened to: the digest-presence guarantee moves from table-CHECK to function-trust -- the third refusal_* column in that established idiom, zero consumers of the digest outside shape gates, refusal RECORDING untouched, and no narrower column-expressible widening exists because R4 keeps the payload (hence its true size) unstored, so any coupling column would be journaler-supplied from the same trust boundary. The prepared question to the maintainer: accept the widening as specced, yes or no.

### `autoharn2 row 1541`

- **ts:** 2026-07-27 21:25:50.595331+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0008-classification-discipline.md:262`
  - `law/adr/0008-classification-discipline.md:293`
  - `law/adr/0012-compositional-and-structural-hygiene.md:1236`
  - `law/adr/0012-compositional-and-structural-hygiene.md:1303`
- **verbatim statement:**

  > MAINTAINER RULING on the s67 merge-hold question (row 1539): the CHECK widening as built is REFUSED -- his words, near-verbatim: NULL as an implicit sentinel/meaning-carrier is not condonable here no matter what the no-consumer test says; it is a drift hazard. The orchestrator's economy argument (zero consumers) was the wrong test -- representation explicitness governs, per ADR-0000 and the standing no-bare-types rule (autoharn2 row 1105). Spec amended and committed: s67 re-shaped to add refusal_digest_disposition (closed two-token vocabulary, kind-scoped) with a two-way coupling CHECK tying digest NULL exactly to payload_over_bound -- restoring table-level enforcement for the accidental-drift case while stating plainly that truthfulness remains function-trust as it always was. compute_row_hash re-issues for the new column. Fix round dispatched to the s66/s67 builder (context intact). FLAGGED as a separate open maintainer decision, deliberately not bundled: the s65 attempted-kind and s43/s49 attempted-actor NULLs carry the same implicit-sentinel shape; whether this ruling extends to them awaits his word.

### `autoharn2 row 1542`

- **ts:** 2026-07-27 21:29:10.415674+02
- **kind:** work_opened
- **citing sites:**
  - `law/adr/0008-classification-discipline.md:295`
  - `law/adr/0012-compositional-and-structural-hygiene.md:1304`
- **verbatim statement:**

  > work_opened: null-sentinel-audit -- Audit the whole codebase and kernel schema against the 2026-07-27 NULL-is-never-a-meaning-carrier amendments (ADR-0008 vocabulary register; ADR-0012 P11 structural register): find every nullable column, Optional field, or sentinel value whose comment, spec, or function body assigns a MEANING to the absence, and classify each as violation / kind-shape-idiom-exempt / already-typed. BACKLOGGED BY MAINTAINER DIRECTION at filing (2026-07-27, verbatim intent: 'file a backlogged ledger entry to audit against it (not acted on today), to ensure we are not committing the multi-billion dollar mistake anywhere in this code base') -- rationale for not-started: the rule landed today; the audit is deliberate follow-on work, not same-day. Known candidates named at filing so the auditor starts warm: kernel refusal_attempted_kind (s65 -- its own LIMITS section concedes cause conflation), refusal_attempted_actor family (s43/s49), and any serving/tools Optionals with meaning-bearing None. Dispatch conditions: the audit brief MUST carry ledger row 1887's three prophylactic clauses verbatim (false-SILENT from convenient search surfaces; false-MET from requirements read down; the third clause as recorded) and the findings route per-column to the maintainer for the extend-the-ruling decision flagged at row 1541.

### `autoharn1 row 1620`

- **ts:** 2026-07-18 17:10:26.659333+02
- **kind:** work_opened
- **citing sites:**
  - `law/adr/0009-performance-investigation-discipline.md:3`
  - `law/adr/0017-the-zero-context-reader.md:3`
- **verbatim statement:**

  > work_opened: doc-tree-reorg-user-guide -- Doc-tree reorganization + user-guide single-homing, maintainer ask 2026-07-18 (his words verbatim): 'a reorganization of the doc tree -- much of the documentation we have is now stale/legacy (e.g. implemented design documents). It would take some link-repointing, but it would also make the entire repos more navigable and less intimidating for humans. I am also starting to lean towards creating a user-guide directory and single-home the end-user relevant documentation into something that is almost a single coherent book (but I would start with just relocating them)'. Phase 1 scope per his last clause: RELOCATION ONLY -- classify every tracked doc (user-guide / living-design / implemented-legacy per the vestigial_documentation precedent / unclear-ask), move end-user docs into user-guide/, repoint links (link_integrity is the acceptance gate), content-preserving throughout. A proposed relocation manifest goes to the maintainer for adjudication BEFORE any move; execution serializes behind the in-flight FAQ writers (recipes author, shaped-recipes factoring) so links are repointed once over the final doc set

### `autoharn1 row 1637`

- **ts:** 2026-07-18 18:04:56.271117+02
- **kind:** snag
- **citing sites:**
  - `law/adr/0000-the-alpha-and-the-omega-type-driven-design.md:560`
  - `law/adr/0012-compositional-and-structural-hygiene.md:1064`
- **verbatim statement:**

  > bootstrap/teardown-world.sh SQL injection, found by the fresh-context review discharging row 1635: the RESOLVE-stage catalog queries interpolate the world name raw into SQL text, so a name matching a scratch-safe glob (e.g. probeworld*) carrying quote-and-semicolon payload executes as SQL unconditionally, BEFORE the drop plan prints and before typed confirmation -- a full bypass of the confirmation ceremony the verb's header calls load-bearing. The step-6 DROP statements share the identical unsafe interpolation. Reviewer verdict FIT-WITH-FINDINGS; the injection was observed live at the RESOLVE stage; the DROP-stage half rests on code inspection (reviewer deliberately did not drive a payload through the destructive stage on the shared host). Expected remedy per review: bind world names as psql -v variables or enforce a strict character allowlist before any SQL text is touched, in both stages. Fixer dispatched this row's date.

### `autoharn1 row 1844`

- **ts:** 2026-07-19 23:05:38.010923+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1108`
- **verbatim statement:**

  > COMBINED FRESH-CONTEXT REVIEW RETURNED 4 FINDINGS, dispositions set. F1 CRITICAL: commit_executor.execute() re-initializes bindings empty on resume and the late-binding replay its own comment at lines 226-236 describes WAS NEVER BUILT -- any still-PENDING entry holding a Hole on an already-DONE entry's produces (the NORMAL shape of the signed-genesis chain: fingerprint, armored key, commission row id) crashes uncaught on resume; falsifies spec §2.6's resume claim, WPC4, and the operator-facing banner; both banked resume fixtures avoid the scenario by construction (foundation case 3 uses independent acts; genesis-resume kills at i==0 where no later Hole spans). DISPOSITION: emergency fix dispatched -- journal persists each produces value alongside DONE (the typed, durable record ADR-0000 Rule 2a wants), plus a red-then-green fixture with a Hole genuinely spanning the resume boundary. F2 MODERATE: scripted-mode scratch-GNUPGHOME prep is a real decision-phase filesystem effect, disclosed in code comments but NOT in spec §2.5's two declared exceptions, and invisible to the §2.8 gate. DISPOSITION: builder moves the prep into the commit phase (preferred; keeps the spec's two exceptions) or reports why not, in which case the spec gains the third declared exception by Fable amendment. F3 MODERATE: Checklist.save() bypasses runner.write_file with a bare truncate-then-write. DISPOSITION: route through the choke point. F2+F3 CLASS FIX: extend the purity gate to also flag bare open-for-write/tempfile/os-write/subprocess in decision-phase modules outside declared exception sites, negative self-check included -- the recurrence-to-mechanism move, so the gate's field of view matches the claim made for it. F4 MINOR: 10s textual bridge timeout can misread sustained load as shutdown; reviewer scored it noted-not-actionable; banked as residue, no action.

### `autoharn1 row 1845`

- **ts:** 2026-07-19 23:05:44.741966+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1108`
- **verbatim statement:**

  > estimate: setup-tui-review-fix | 250 | 0 | 60m | 1M | Fable orchestrator pre-dispatch 2026-07-19 at medium tier; emergency-class fix (the maintainer's reserved margin's stated purpose): F1 resume-bindings persistence + spanning-Hole fixture, F2 scratch-prep relocation, F3 checklist choke-point routing, F2/F3 class gate extension

### `autoharn1 row 1846`

- **ts:** 2026-07-19 23:27:27.542224+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1108`
- **verbatim statement:**

  > actual: setup-tui-review-fix | 416 | 0 | 107m | 853K | harness task-notification 2026-07-19 at medium tier

### `autoharn1 row 1847`

- **ts:** 2026-07-19 23:27:27.648706+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1108`
- **verbatim statement:**

  > REVIEW-FIX CYCLE CLOSED AND PUSHED (d8a375e + 1de2553, main). F1: journal now persists each DONE entry's produces name and value atomically with the DONE mark; resume loads bindings before continuing; the red leg REPRODUCED THE EXACT DEFECT against the pinned pre-fix module (b565db1 via importlib -- KeyError from Hole.resolve on a genuinely fresh resume), then green on the fixed module; WG1-WG5 and signed-genesis-resume witnessed live; the operator banner's resume claim is now TRUE. F2: scratch-GNUPGHOME prep moved to the commit phase via a new generic plan.CallableAct with downstream Holes on its real return -- byproduct: dry-run now creates ZERO scratch state, strictly stronger purity than before; spec's two declared exceptions stand exactly two. F3: Checklist.save routed through runner.write_file, documented as a narrow post-commit exception (content unknowable until commit ends -- structurally not a plan entry). CLASS FIX: purity gate gained check_extra_effects over an audited exemption table (writing-mode open, os/shutil/tempfile/subprocess effect calls outside declared sites), docstring honest about syntactic limits, negative self-check proves the bare open-for-write case red; census 139. F4 residue stands as banked. THE DAY'S TUI ARC IS CLOSED: textual shell, pure-core restructure (decision phase pure by construction and by gate; one commit boundary; journal-backed resume now honest), fresh-context review, all findings repaired-as-class, everything witnessed live except the textual pinentry leg which only the maintainer's terminal can produce. Remaining standing items unchanged: textual live legs (maintainer), purity-gate + typed-table pre-commit wiring in the hooks/ session-boundary batch, ADR-0012 P9-lift Fable consult (row 1826, after tomorrow).

### `autoharn1 row 1848`

- **ts:** 2026-07-21 20:51:16.794672+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1108`
- **verbatim statement:**

  > estimate: setup-tui-field-report-investigation | 100-250 | 4 | 30m-60m | 1M | Fable orchestrator pre-dispatch 2026-07-21: maintainer field-tested the setup TUI birthing the blank world and filed 8 observations (a-h) plus AUTOHARN_BACKFLOW.md's 8 findings; 4 read-only Sonnet investigators in parallel, scopes split TUI-shell UX, flow robustness, governance/file-size, backflow triage; report-only per standing rule; strategy doc authored by Fable after reports land

### `autoharn1 row 1849`

- **ts:** 2026-07-21 21:02:05.475402+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1108`
- **verbatim statement:**

  > actual: setup-tui-field-report-investigation | 122 | 4 | 9m | 527K | four harness task-notifications 2026-07-21; four parallel Sonnet investigators (TUI-shell 125K/32 calls, flow-robustness 183K/54, governance 110K/25, backflow-triage 109K/11); wall-clock is parallel envelope not sum; all four returned mechanism-level reports with witness marks

### `autoharn1 row 1850`

- **ts:** 2026-07-21 21:04:15.852569+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0012-compositional-and-structural-hygiene.md:1108`
- **verbatim statement:**

  > SETUP-TUI FIELD-TEST INVESTIGATION CLOSED, STRATEGY AUTHORED (design/FABLE-SETUP-TUI-FIELD-STRATEGY.md, uncommitted pending maintainer read). Four read-only investigators returned mechanism-level reports on the maintainer's a-h observations plus AUTOHARN_BACKFLOW.md's 8 findings. Synthesis: four defect classes -- (I) structure erased into str / prose embedded in code (obs a+b; foreclosing type: typed UI content vocabulary + content-as-data), (II) boundary fact probed ad hoc not owned once (obs c: five disagreeing dest checks, screen_birth checks NOTHING; backflow 2: stamp_provenance sole hook not on GATE_SUBJECT_ROOT; foreclosing type: DestinationState computed at one Port + sentinel), (III) told-vs-verified conflation in checklist vocabulary (PREPARED one value two jobs; REFUSED genesis gate non-blocking -- birth completed with permanently-unverifiable genesis commission, backflow 1 HIGH; otel feature zero coverage silently, backflow 3), (IV) ADR-0002 rung-5 silent fallbacks (unpinned gpg signing key; hardcoded venv path silently downgrading operator yes; ctrl+c silent no-op shadowed by textual Screen.copy_text; stamp_provenance silent return 0). Rule 2(b) executive finding: screens.py born 572 lines already over ADR-0007 ceiling, grew to 1458 through FOUR fresh-context ADR reviews none of which asked 0007's trigger question -- review-only surface failed 4x, mechanization trigger fired, max-lines gate to mint. Non-issues named: ctrl+q quit witnessed working (d half-spurious); backflow 6 is downstream education (subagent must write its own review, kernel right to refuse relayed verdicts); backflow 7b is the ratified s31 fork-1 tradeoff, not reopened. UNEXERCISED: obs h rehearsal crash -- world transcript shows its one captured rehearsal GREEN, setup_log.txt truncates mid-gpg, needs maintainer repro detail. Three tracks: constitutional (ADR-0012 data-is-not-code amendment + ADR-0007 gate + genesis-gate-severity maintainer question), class fixes (typed Ui vocabulary, content extraction, DestinationState, checklist status split + start-daemons generation, navigation spec), local fixes (stdin=DEVNULL runner.py:147, sign -u fingerprint pin, ctrl+c binding, venv fallback, backflow 5/7a/8/4). Backflow 5 witnessed live this session: row 1849 write printed the boilerplate four times.

### `autoharn1 row 1887`

- **ts:** 2026-07-21 23:28:11.327446+02
- **kind:** decision
- **citing sites:**
  - `law/adr/backlog/0021-the-checked-surface-is-the-shipped-surface.md:70`
  - `law/adr/history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md:18`
- **verbatim statement:**

  > STANDING METHOD RULE (maintainer-commissioned prophylactic, 2026-07-22, from the AC/IA audit's twin failures): AN AUDITOR MUST NOT LET THE AVAILABLE EVIDENCE DEFINE THE QUESTION. The one coin, two faces: (ABSENCE FACE) a verdict of absence is only as good as the enumerated search universe -- the auditor verdicts SILENT after searching the surface most convenient to walk (here: the repo tree) when the system's own production model puts the artifact elsewhere (per-deployment birth artifacts, the public remote, registered-in-world records); witnessed twice, AC-1 and IA-1, plus AC-22's wrong-surface sibling. (PRESENCE FACE) a verdict of satisfaction is only as good as the requirement's own full statement -- the auditor verdicts MET because a nearby, citable, genuinely-good mechanism flatters part of the control, reading the requirement down to fit what was found (clause dropped: AC-3 reads/entitlement, IA-4 authorization-to-assign; standard flexed: AC-7 shape-reading vs AC-8/9 literal; vocabulary upgraded: tamper-evident -> tamperproof); witnessed four of six METs. SAME ROOT: evidence-first reasoning, where what-I-found determines both what-exists and what-suffices. THE PROPHYLACTIC, binding on future audit briefs verbatim: (1) an absence verdict names its searched surfaces, and the surface list is derived from where the system PRODUCES artifacts of that kind, not from where the auditor happens to stand; (2) a presence verdict walks the requirement's own statement clause by clause before looking at any mechanism, with one interpretive strictness constant across all rows, and paraphrase never stronger than the source's own vocabulary claim; (3) requirement first, evidence second -- never the reverse. Full specimen record: rows 1884/1886 and the audit doc's second-opinion provenance paragraph.

### `autoharn1 row 1905`

- **ts:** 2026-07-22 00:34:47.003989+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0000-the-alpha-and-the-omega-type-driven-design.md:596`
- **verbatim statement:**

  > COMMISSION CORRECTED BY MAINTAINER (2026-07-22, near-verbatim: unless you can honestly name the auditor for whom we are obliged to submit that record, it feels like cargo-culting; and the record is already incomplete and, in a sense, dishonest): the HARVEST requirement the orchestrator added to row 1904 is DROPPED -- no banner-data artifact, no migration seed. Orchestrator error owned as a class instance: preservation-without-a-named-consumer is the ritual-paperwork shape the runs-are-linear ruling deletes rather than documents; pressed honestly, no auditor is owed the banner record; git history already preserves every pre-strip banner immutably (the harvest would have been a redundant copy); and seeding the future provenance schema with a lossy-by-construction record would launder its dishonesty forward -- the schema starts clean from the action stream. The strip proceeds strip-only; the adjudication half stays (it protects file CONTENT, which is load-bearing); adjudication decisions report-only, not committed. Builder amended mid-flight.

### `autoharn1 row 1906`

- **ts:** 2026-07-22 00:36:59.947727+02
- **kind:** decision
- **citing sites:**
  - `law/adr/0000-the-alpha-and-the-omega-type-driven-design.md:596`
- **verbatim statement:**

  > STANDING RULE MINTED -- THE NAMED-CONSUMER TEST (maintainer-recognized 2026-07-22 as the first ADR-0000 Rule 2(b) answer to take shape for the recurring bureaucratic-cargo-culting class; his words: 'something like the first time a 2(b) solution has taken shape from the mist regarding the recurrence of this bureaucratic cargo-culting -- a sound rationale'): every record kept, ceremony performed, or artifact preserved must NAME ITS CONSUMER -- the specific auditor, reader, process, or failure-mode investigation that will consume it. A step whose consumer cannot be honestly named is ritual, and ritual is deleted, not documented (the runs-are-linear ruling's existing posture, now given its prospective test). The test is asked AT PROPOSAL TIME, by the proposer, with the same self-suspicion ADR-0000 Rule 2 demands of the patch-reflex -- 'for the audit trail' and 'for safety' are not consumers, they are the demurral shapes this test exists to catch. SPECIMENS: the banner-harvest requirement (caught live by the maintainer's one question, row 1905); the retired apply-delta typed-confirmation ceremony (2026-07-11, cargo-cult sysadmin work); the certification-bureaucracy rejections (quality-bar rulings). Enforcement surface, honest per ADR-0011 Rule 1: review-only -- the test is a question; its strength is that it is cheap, binary, and embarrassing to fail. Candidate for law by dated ADR amendment when the maintainer wants it constitutional; until then it binds as this ledger rule.

## Resolution tally

- Distinct cited rows found in `law/adr/**`: 87
- Resolved to `autoharn1`: 16
- Resolved to `autoharn2`: 71
- Resolved to `autoharn3`: 0
- UNRESOLVABLE: 0
- AMBIGUOUS (unresolved after content check): 0
