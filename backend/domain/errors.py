"""
Domain-level error taxonomy.

Two-axis structure:

    DomainError                    base for everything below
    ├── NotFoundError              "the thing you asked for doesn't exist"
    │   ├── CardNotFoundError
    │   └── ResourceNotFoundError
    └── InvalidInputError          "the request is malformed at the domain level"
        ├── InvalidReviewError
        └── PipelineDSLError

Routes catch the *axis* (NotFoundError → 404, InvalidInputError → 422)
without needing to enumerate every concrete subclass. The concrete
subclasses exist for diagnostic clarity in messages, logs, and tests,
and so future code can react to specific failure modes without
reparsing message strings.

These are intentionally separate from FastAPI's HTTPException — domain
code raises domain errors; only the outermost (route) layer translates
to HTTP. This is the Dependency Rule: nothing in `domain/` or
`services/` should know that HTTP exists.
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
