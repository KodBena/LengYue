# Band-conformance self-test fixture — the ghost-row proof

This is NOT a real file map. It is a synthetic `FILES.md`-shaped fixture
that reintroduces the `jquery-bridge.ts` **ghost row** — a band row naming
a path that does not exist on disk. That ghost was real: `jquery-bridge.ts`
was deleted 2026-06-01 (commit `9949b28`) while its `FILES.md` row lingered,
exactly the drift the brief names as the checker's fail-loud test case.

The ghost is FIXED on the real tree (the row is gone). This fixture is the
standing proof that `tools/band-conformance/check.mjs` would surface it as
fatal structural drift (ADR-0002) if it — or any future ghost row — returned.
`check.mjs --self-test` parses this fixture's tree, runs the analysis against
an empty src root, and asserts the ghost row is caught.

The tree below is deliberately tiny: one real-shaped directory and the ghost
leaf. The parser keys on the box-drawing indentation, so the shape must match
the real `FILES.md` tree's `│   ` / `├── ` / `└── ` rendering.

```
frontend/src/
├── main.ts                            [B1]  A real-looking root file (resolves to nothing under the fixture's empty src root — this fixture is a parse target only).
│
└── engine/                                  Pure Go-engine code.
    └── jquery-bridge.ts               [B3]  THE GHOST: deleted 2026-06-01 (9949b28); this row is the drift the checker must catch.
```

## License

Public Domain (The Unlicense).
