# Pipeline DSL Reference

This document describes the card-set assembly pipeline used by the ebisu
review system.  Include it as context when asking an LLM to help construct a
pipeline.

---

## Overview

A card-set is assembled by a linear sequence of **stages**, each transforming
`list[CardNode] → list[CardNode]`.  The pipeline is serialised as a JSON array
and sent in the `create_card_set` WebSocket message alongside a list of
**context IDs** (pivot card IDs that anchor the structural selection).

```json
{
  "action":      "create_card_set",
  "context_ids": [<int>, ...],
  "pipeline":    [<stage>, ...]
}
```

Rules:
- The first stage must always be `"select"`.
- No other `"select"` stage may appear.
- All subsequent stages are pure transforms over the pool produced by `"select"`.

---

## Stages

### `select`

Executes a **Selection** against the database for each `context_id`, unions
the results (first-seen structural coordinates win on collision), computes
structural coordinates (height, subtree\_size, centroid\_rank,
heavy\_path\_rank), and applies an initial sort.

```json
{
  "stage":     "select",
  "selection": <Selection>,
  "ordering":  <OrderKey>        
}
```

`ordering` is optional; defaults to `{"type": "DepthKey"}` (BFS).

### `order`

Re-sorts the current pool by a new OrderKey.

```json
{"stage": "order", "ordering": <OrderKey>}
```

### `take`

Keeps only the first `n` cards; discards the rest.

```json
{"stage": "take", "n": <int>}
```

### `shuffle`

Uniformly random shuffle; does not change cardinality.

```json
{"stage": "shuffle"}
```

---

## Selection

Selections describe *which cards* to retrieve, rooted at each `context_id`
(referred to as κ in comments).

### Primitives

| Type | Description |
|------|-------------|
| `ContextSelection` | κ itself. |
| `AncestorSelection` | The single n-th ancestor of κ. `"n"` ≥ 1, default 1. |
| `DescendantSelection` | All descendants of κ up to `"max_depth"` (null = unbounded). κ itself excluded. |
| `SiblingSelection` | Other children of κ's parent. κ excluded. |
| `SubtreeSelection` | Subtree rooted at the n-th ancestor of κ, expanded to depth m below that root. `"n"` ≥ 0 (0 = κ is root), `"m"` null = unbounded. |

```json
{"type": "ContextSelection"}
{"type": "AncestorSelection",   "n": 2}
{"type": "DescendantSelection", "max_depth": 4}
{"type": "SiblingSelection"}
{"type": "SubtreeSelection",    "n": 1, "m": 5}
```

### Combinators

```json
{"type": "union",     "a": <Selection>, "b": <Selection>}
{"type": "intersect", "a": <Selection>, "b": <Selection>}
{"type": "filter",    "base": <Selection>, "tag_expression": "<tag DSL string>"}
```

**union**: Set union. On card\_id collision, structural coords from the
first context\_id that produced the card are kept.

**intersect**: Set intersection. Structural coords taken from the left operand.

**filter**: Restricts to cards matching a tag DSL expression (see Tag DSL
section below).

---

## OrderKey

Order keys map a card to a sort score.  Lower score → reviewed sooner.

### Structural keys
*(require structural coordinates populated by `"select"`)*

| Type | Meaning |
|------|---------|
| `DepthKey` | Depth from selection root ascending — BFS order. |
| `HeightKey` | Height ascending — leaves first (bottom-up / fringe-first). |
| `SubtreeSizeKey` | Subtree size ascending — terminal positions first. |
| `CentroidRankKey` | Centroid decomposition order — balanced coverage. |
| `HeavyPathRankKey` | Heavy-light decomposition order — main line before sidelines. |

### Semantic keys
*(require card columns in `node.extra`, populated by `"select"`)*

| Type | Meaning |
|------|---------|
| `NumReviewsKey` | Fewer reviews → higher priority. |
| `NumMovesKey` | Fewer moves → simpler position → higher priority. |
| `EbisuRecallKey` | Estimated time until recall decays to target. Lower = more overdue. Requires a live Timestamp; the server injects this automatically. |

### Combinators

```json
{"type": "negated",            "key": <OrderKey>}
{"type": "LexicographicOrder", "keys": [<OrderKey>, ...]}
{"type": "WeightedSumOrder",   "terms": [{"key": <OrderKey>, "weight": <float>}, ...]}
```

**negated**: Reverses the sort direction of a key.

**LexicographicOrder**: Primary key first; later keys break ties.

**WeightedSumOrder**: Weighted linear combination. Meaningful only when keys
are on comparable scales; structural keys are integer-valued, Ebisu scores are
float days-to-decay.

### Named presets

| Type | Expands to |
|------|------------|
| `bfs_order` | `DepthKey` |
| `dfs_preorder` | `HeavyPathRankKey` |
| `dfs_postorder` | `LexicographicOrder([HeightKey, HeavyPathRankKey])` |
| `fringe_first` | `LexicographicOrder([HeightKey, DepthKey])` |
| `centroid_order` | `CentroidRankKey` |
| `main_line_first` | `LexicographicOrder([HeavyPathRankKey, NumReviewsKey])` |

---

## Tag DSL

Used inside `"filter"` selections.  Syntax:

- **AND**: comma — `attack,~contact_play` (has `attack` AND NOT `contact_play`)
- **OR**: semicolon or newline — `attack;defense`
- **Negation**: `~` prefix — `~snark`
- **Virtual tags**: `$` prefix, defined inline — `$fight :- attack;defense.`

Full example:
```
$fight :- attack;defense.
$fight,~contact_play
```

---

## Structural coordinates

Every card in a selected pool carries:

| Field | Meaning |
|-------|---------|
| `depth` | Distance from the selection root (0 = root). Negative for ancestors. |
| `height` | Length of longest path to a leaf below this node. 0 for leaves. |
| `subtree_size` | Number of nodes in the subtree rooted here, including self. |
| `centroid_rank` | Order of discovery in centroid decomposition. Balanced coverage. |
| `heavy_path_rank` | Order in heavy-light decomposition. Main lines precede sidelines. |

---

## Common patterns

### BFS — breadth-first, shallow cards first
```json
[
  {"stage": "select",
   "selection": {"type": "DescendantSelection"},
   "ordering":  {"type": "bfs_order"}},
  {"stage": "take", "n": 20},
  {"stage": "shuffle"}
]
```

### Bottom-up — leaves before their parents
```json
[
  {"stage": "select",
   "selection": {"type": "SubtreeSelection", "n": 0},
   "ordering":  {"type": "fringe_first"}},
  {"stage": "take", "n": 20},
  {"stage": "shuffle"}
]
```

### Ebisu priority — overdue cards first, then randomise
```json
[
  {"stage": "select",
   "selection": {"type": "DescendantSelection"},
   "ordering":  {"type": "bfs_order"}},
  {"stage": "take",  "n": 50},
  {"stage": "order", "ordering": {"type": "EbisuRecallKey"}},
  {"stage": "take",  "n": 10},
  {"stage": "shuffle"}
]
```

### Tag-filtered warm-up — no Ebisu, filtered by tag
```json
[
  {"stage": "select",
   "selection": {"type": "filter",
                 "base": {"type": "DescendantSelection"},
                 "tag_expression": "~snark"},
   "ordering":  {"type": "bfs_order"}},
  {"stage": "take",    "n": 30},
  {"stage": "shuffle"}
]
```

### Stable partition — cards from subtree A always before subtree B
```json
[
  {"stage": "select",
   "selection": {"type": "union",
                 "a": {"type": "SubtreeSelection", "n": 1, "m": 3},
                 "b": {"type": "SubtreeSelection", "n": 2, "m": 3}},
   "ordering":  {"type": "bfs_order"}},
  {"stage": "take", "n": 40},
  {"stage": "order", "ordering": {
     "type": "LexicographicOrder",
     "keys": [{"type": "EbisuRecallKey"}, {"type": "DepthKey"}]}}
]
```

### Main line then sidelines — heavy path first, then Ebisu
```json
[
  {"stage": "select",
   "selection": {"type": "SubtreeSelection", "n": 0},
   "ordering":  {"type": "dfs_preorder"}},
  {"stage": "order", "ordering": {
     "type": "LexicographicOrder",
     "keys": [{"type": "HeavyPathRankKey"}, {"type": "EbisuRecallKey"}]}},
  {"stage": "take",    "n": 15},
  {"stage": "shuffle"}
]
```

---

## JavaScript client — `initSession`

```js
initSession: function(
    context_ids = [],
    pipeline    = [
        {stage: "select",
         selection: {type: "DescendantSelection"},
         ordering:  {type: "bfs_order"}},
        {stage: "take",    n: 30},
        {stage: "order",   ordering: {type: "EbisuRecallKey"}},
        {stage: "take",    n: 10},
        {stage: "shuffle"},
    ],
) {
    connservice.connect();
    connservice.send("authenticate", {"username": "bork"})
        .then(res => { console.log(res); })
        .catch(err => { console.error("Authentication failed:", err); })
        .then(() =>
            connservice.send("create_card_set", {context_ids, pipeline})
        )
        .then(res => {
            card_set_key = res['card_set_key'];
            return connservice.send("fetch_card_set",
                {card_set_key: res['card_set_key']});
        })
        .then(res => { cardset = res; card_cursor = 0; })
        .then(() =>
            connservice.send("create_review_session",
                {card_set_key: card_set_key})
                .then(res => {
                    review_session_id = res['session_id'];
                    console.log(`created review session; session_id=${res['session_id']}`);
                })
        );
},
```

---

## Convenience macros (JavaScript)

These are thin wrappers over `initSession` for common use cases.

```js
// Bottom-up DFS over a subtree, no Ebisu.
// Hypothesis: understand deep positions before shallow ones.
// truncate controls how many cards to draw.
bottomUp: function(context_id, truncate = 20) {
    return initSession(
        [context_id],
        [
            {stage: "select",
             selection: {type: "SubtreeSelection", n: 0},
             ordering:  {type: "fringe_first"}},
            {stage: "take",    n: truncate},
            {stage: "shuffle"},
        ]
    );
},

// Standard Ebisu session: BFS pool, Ebisu re-sort, randomise.
ebisuSession: function(context_ids, pool = 50, draw = 10) {
    return initSession(
        context_ids,
        [
            {stage: "select",
             selection: {type: "DescendantSelection"},
             ordering:  {type: "bfs_order"}},
            {stage: "take",  n: pool},
            {stage: "order", ordering: {type: "EbisuRecallKey"}},
            {stage: "take",  n: draw},
            {stage: "shuffle"},
        ]
    );
},

// Siblings of the current card — lateral practice at the same tree level.
siblingSession: function(context_id, truncate = 10) {
    return initSession(
        [context_id],
        [
            {stage: "select",
             selection: {type: "SiblingSelection"},
             ordering:  {type: "bfs_order"}},
            {stage: "take",    n: truncate},
            {stage: "shuffle"},
        ]
    );
},

// Main line first: heavy-path DFS, then sidelines.
// Good for studying a joseki or game sequence in narrative order.
mainLine: function(context_id, truncate = 20) {
    return initSession(
        [context_id],
        [
            {stage: "select",
             selection: {type: "SubtreeSelection", n: 0},
             ordering:  {type: "dfs_preorder"}},
            {stage: "take",    n: truncate},
        ]
    );
},

// Centroid session: maximally balanced coverage of a subtree.
// Each card reviewed gives roughly equal information about all branches.
centroidSession: function(context_id, truncate = 20) {
    return initSession(
        [context_id],
        [
            {stage: "select",
             selection: {type: "SubtreeSelection", n: 0},
             ordering:  {type: "centroid_order"}},
            {stage: "take",    n: truncate},
            {stage: "shuffle"},
        ]
    );
},

// Tag-filtered warm-up: no Ebisu, excludes tagged cards, randomised.
warmUp: function(context_ids, tag_expression = "~snark", truncate = 30) {
    return initSession(
        context_ids,
        [
            {stage: "select",
             selection: {type: "filter",
                         base: {type: "DescendantSelection"},
                         tag_expression: tag_expression},
             ordering:  {type: "bfs_order"}},
            {stage: "take",    n: truncate},
            {stage: "shuffle"},
        ]
    );
},

// Multi-root union: study the same position from several parent contexts.
// Useful when a joseki variation appears under multiple parent moves.
multiRoot: function(context_ids, truncate = 20) {
    return initSession(
        context_ids,
        [
            {stage: "select",
             selection: {type: "DescendantSelection"},
             ordering:  {type: "centroid_order"}},
            {stage: "take",    n: truncate},
            {stage: "shuffle"},
        ]
    );
},
```
