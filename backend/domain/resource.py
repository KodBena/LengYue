"""
Static resource domain module.

Defines the generic wire shape for static-resource responses and the
Port that adapters (filesystem today, potentially S3/CDN/HTTP-fetch
tomorrow) implement.

Pure domain: no FastAPI, no filesystem imports, no network code. Any
consumer needing "give me resource X" depends on the Port here and
gets a testable seam for free.

Why this module exists as its own file (not folded into card.py or
stats.py): static resources are a genuinely distinct concern from
spaced-repetition content. They're configuration, not user data:
visit distributions, chart-drawing palettes, opening-book metadata,
anything the frontend needs to render that doesn't depend on which
user is looking. Keeping them in their own domain module avoids
overloading the card/stats modules with content they have no
relationship to.
"""
from typing import Any, List, Protocol

from pydantic import BaseModel, ConfigDict


class ResourceResponse(BaseModel):
    """
    The wire shape for GET /resources/{name}.

    Generic envelope: `content` is typed as `Any` because the payload
    shape varies per resource. This is a deliberate concession —
    Pydantic doesn't validate the inner structure, and downstream
    consumers (the frontend) are responsible for knowing the shape
    for the resource they asked for.

    The alternative (discriminated union typed per resource) would be
    architecturally purer but over-engineered for a handful of static
    JSON blobs. Escalation path: if resources grow to need validation,
    replace `content: Any` with a discriminated union keyed on `name`
    and give each resource a typed payload class. The wire envelope
    stays the same; the frontend codegen (item 30) then gets per-
    resource types for free.

    `name` echoes the resource slug the caller requested. Useful when
    a response is cached and the cache key needs reconstructing, and
    for log messages that correlate a response to its request without
    URL parsing.
    """
    model_config = ConfigDict(frozen=True)

    name: str
    content: Any


class StaticResourceRepositoryPort(Protocol):
    """
    The contract for fetching named static resources.

    Introduced when the /resources/{name} endpoint was added, to carry
    the "give me the contents of X" concern out of the route handler
    (where it first lived, inline, with a raw `open(path)` call) into
    a testable seam.

    Two methods:

    - fetch(name): return the raw content of the resource as a Python
      object (typically a dict parsed from JSON, but the Port doesn't
      commit to that — a future YAML/BIN resource adapter satisfies
      the same Port with any JSON-compatible return type).
      Raises ResourceNotFoundError if `name` is not in the registry.

    - list_names(): return all registered resource names, sorted.
      Powers the discovery endpoint (GET /resources) so the frontend
      can know what's available without hardcoding names.

    A filesystem adapter (FilesystemResourceRepository) satisfies this
    Port today, reading from a configurable directory. A future
    S3ResourceRepository or HttpResourceRepository would satisfy the
    same Port with no changes to the service or route layer.

    A test fake is ~5 lines:

        class FakeResourceRepo:
            def __init__(self, resources: dict):
                self._resources = resources
            async def fetch(self, name: str):
                if name not in self._resources:
                    raise ResourceNotFoundError(name)
                return self._resources[name]
            async def list_names(self) -> list[str]:
                return sorted(self._resources.keys())
    """

    async def fetch(self, name: str) -> Any:
        """
        Return the parsed content of the named resource.

        Raises:
            ResourceNotFoundError: the `name` is not in the registry.
                The route maps this to 404 via the existing
                NotFoundError handler — no route-level change needed.
            Exception: anything else (file-missing-on-disk, JSON
                parse error) propagates as a 500. These are deployment
                errors, not user errors, and deserve the loud failure.
        """
        ...

    async def list_names(self) -> List[str]:
        """
        Return all registered resource names, sorted alphabetically.

        Consumers can use this for cache warmup, discovery UIs, or
        health checks. Cheap call — the registry is an in-memory map.
        """
        ...
