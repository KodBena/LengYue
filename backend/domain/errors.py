"""
domain/errors.py

Domain-level error taxonomy.

Three-axis structure:

    DomainError                    base for everything below
    ├── NotFoundError              "the thing you asked for doesn't exist"
    │   ├── CardNotFoundError
    │   └── ResourceNotFoundError
    ├── InvalidInputError          "the request is malformed at the domain level"
    │   ├── InvalidReviewError
    │   ├── PipelineDSLError
    │   └── LineageOverflowError   "tree exceeds caller-supplied node cap"
    ├── ResourceLimitError         "the request would exceed a resource limit"
    │   ├── BundleTooLargeError
    │   └── UserQuotaExceededError
    └── UnknownSchemeError         "a stored row carries an unrecognised codec scheme"

Routes catch the *axis* (NotFoundError → 404, InvalidInputError →
422, ResourceLimitError → 413) without needing to enumerate every
concrete subclass. UnknownSchemeError is its own thing — an
internal invariant violation that should propagate as 500 with
structured detail (the analysis-persistence arc; ADR-0002 named
explicitly per Confirmation C2 in
docs/dispatch/backend-to-frontend-analysis-persistence-status.md).

The concrete subclasses exist for diagnostic clarity in messages,
logs, and tests, and so future code can react to specific failure
modes without reparsing message strings.

These are intentionally separate from FastAPI's HTTPException — domain
code raises domain errors; only the outermost (route) layer translates
to HTTP. This is the Dependency Rule: nothing in `domain/` or
`services/` should know that HTTP exists.

License: Public Domain (The Unlicense)
"""


class DomainError(Exception):
    """Base for all domain-level errors."""


class NotFoundError(DomainError):
    """A requested resource does not exist."""


class CardNotFoundError(NotFoundError):
    """The card with the given id was not found (or not owned by the caller)."""


class ResourceNotFoundError(NotFoundError):
    """
    The requested static resource is not known.

    Raised by ResourceService when a caller asks for a resource name
    that isn't in the registered catalog. Distinct from "file exists
    in the registry but is missing on disk at read time" — that
    condition is a deployment error and surfaces as a 500 via the
    generic exception handler.

    Introduced alongside StaticResourceRepositoryPort when the
    /resources/{name} endpoint was added.
    """


class InvalidInputError(DomainError):
    """Caller-supplied data does not satisfy a domain invariant."""


class InvalidReviewError(InvalidInputError):
    """A ReviewRequest is malformed against the target card."""


class PipelineDSLError(InvalidInputError):
    """The pipeline or tag DSL is malformed.

    Raised at parse/build time (e.g., from PipelineExecutor.run,
    build_selection_cte, TagDSLCompiler.compile_to_subquery), not at
    SQL execution time. Message includes the offending fragment so
    the caller can see exactly what was rejected.
    """


class LineageOverflowError(InvalidInputError):
    """The requested tree exceeds the caller-supplied `max_nodes` cap.

    Raised by `LineageRepositoryPort.fetch_tree_by_root` when the
    tree rooted at the requested card contains more than `max_nodes`
    nodes. Carries both numbers so the route can populate the
    structured 422 body specified by the card-tree backend spec
    (`docs/notes/card-tree-backend-spec.md`).

    Per ADR-0002 (fail loudly) — explicitly preferred over post-hoc
    truncation, which would silently return an undefined subset of
    the tree. The caller raises max_nodes deliberately or asks a
    different question.
    """

    def __init__(self, *, actual_size: int, max_nodes: int):
        self.actual_size = actual_size
        self.max_nodes = max_nodes
        super().__init__(
            f"tree exceeds max_nodes (actual={actual_size}, "
            f"max_nodes={max_nodes})"
        )


class ResourceLimitError(DomainError):
    """A request would exceed a resource limit.

    Distinct from InvalidInputError because the request itself is
    well-formed — it just overshoots a configured cap. Routes map
    this axis to 413 Payload Too Large with a structured detail
    body that carries `kind` (the concrete failure mode), the
    observed size, and the cap.

    Introduced for the cross/analysis-persistence arc; see the
    dispatch's Confirmation C1 for the wire-shape contract.
    """


class BundleTooLargeError(ResourceLimitError):
    """The request body exceeds the per-bundle byte cap.

    Raised by `AnalysisBundleService.upsert` when the JSON request
    body length exceeds `ANALYSIS_PERSISTENCE_BUNDLE_MAX_BYTES`.
    The route projects this to 413 with body
    `{kind: "bundle_too_large", detail, request_bytes, cap_bytes}`.
    """

    def __init__(self, *, request_bytes: int, cap_bytes: int):
        self.request_bytes = request_bytes
        self.cap_bytes = cap_bytes
        super().__init__(
            f"analysis bundle exceeds per-bundle cap "
            f"(request_bytes={request_bytes}, cap_bytes={cap_bytes})"
        )


class UserQuotaExceededError(ResourceLimitError):
    """The caller's storage would exceed the configured user quota.

    Raised by `AnalysisBundleRepositoryPort.upsert` when the SUM of
    the caller's bundle byte_size — minus the row being replaced
    (if any) plus the incoming row — would exceed
    `ANALYSIS_PERSISTENCE_USER_QUOTA_BYTES`. The check is atomic
    with the upsert (same transaction).

    The route projects this to 413 with body
    `{kind: "user_quota_exceeded", detail, current_bytes, quota_bytes}`.
    """

    def __init__(self, *, current_bytes: int, quota_bytes: int):
        self.current_bytes = current_bytes
        self.quota_bytes = quota_bytes
        super().__init__(
            f"user storage quota would be exceeded "
            f"(current_bytes={current_bytes}, quota_bytes={quota_bytes})"
        )


class UnknownSchemeError(DomainError):
    """A stored analysis_bundles row carries a codec scheme the
    dispatcher doesn't recognise.

    Should be unreachable in practice — the backend only writes
    rows with schemes its own dispatch table knows about — but a
    re-pack rolled back, a hand-edited row, or a deployment with a
    misconfigured `ANALYSIS_PERSISTENCE_WRITE_SCHEME` could
    surface it on read. Per ADR-0002 (Confirmation C2 in
    `docs/dispatch/backend-to-frontend-analysis-persistence-status.md`),
    fail loudly: 500 with structured detail
    `{kind: "unknown_scheme", scheme, detail}` rather than silently
    returning an empty bundle.
    """

    def __init__(self, *, scheme: str):
        self.scheme = scheme
        super().__init__(
            f"unknown analysis-bundle storage scheme: {scheme!r}"
        )
