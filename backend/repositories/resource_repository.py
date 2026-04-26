"""
Filesystem resource repository — the adapter for
StaticResourceRepositoryPort.

Reads from a configurable registry of (name -> filesystem path) pairs,
loading JSON content on demand. A future S3/CDN/HTTP adapter would
satisfy the same Port by implementing the two methods against its
own backing store, with no service or route changes.

Registry shape
--------------
The constructor takes an explicit Dict[str, Path]. Resource names are
slugs (e.g., "visit-distribution"); paths are filesystem locations.

Why explicit over auto-discovery:

- Autodiscovery (e.g., glob `data/*.json`) makes the resource catalog
  a function of what's in the data directory at request time —
  surprising behavior when a resource is missing because someone
  forgot to deploy a file.
- An explicit registry declared at app startup makes misconfiguration
  a loud failure (e.g., a registered resource whose file doesn't exist
  is noticed immediately on first fetch attempt, not silently served
  as 404 to users).
- The registry lives in api/dependencies.py, close to the other DI
  factories, so "which resources does this deployment expose?" is one
  file-lookup away.

Async file I/O
--------------
File reads use asyncio.to_thread. The wrapped open() + json.load() is
blocking; doing it synchronously would block the event loop for the
duration of the read. At hobby scale the blocking is microseconds and
makes no practical difference; the wrap is idiomatic correctness for
an async API, and costs nothing.
"""
import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List

from domain.errors import ResourceNotFoundError
from domain.resource import StaticResourceRepositoryPort


def _read_json_sync(path: Path) -> Any:
    """
    Synchronous file-read helper, factored out so asyncio.to_thread
    can dispatch it to the thread pool.

    Any OSError (missing file, permission denied) or JSONDecodeError
    propagates to the caller unchanged. These are deployment errors —
    the registry points at a resource file that's missing or corrupt
    — and surface as 500s via the generic exception handler. That's
    the right loud failure: a misconfigured deployment should not
    silently turn into 404s.
    """
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


class FilesystemResourceRepository(StaticResourceRepositoryPort):
    """
    Reads named static resources from a configured filesystem
    registry.

    The adapter is stateless beyond the registry map — there's no
    caching layer here. If resource payloads grow large enough that
    re-reading on every request becomes measurable, either:
      (a) wrap this with a decorating CachingResourceRepository that
          also implements StaticResourceRepositoryPort, or
      (b) move caching into the service layer if cache invalidation
          becomes a policy decision.
    The Port protects both options.
    """

    def __init__(self, registry: Dict[str, Path]):
        """
        Registry maps resource name slugs to absolute filesystem paths.

        Example:
            FilesystemResourceRepository({
                "visit-distribution": Path("/app/data/visit_distribution.json"),
            })

        Constructor does NOT validate that paths exist — that check is
        deferred to first fetch. An app that starts successfully but
        has a missing resource file will serve the missing resource
        as a 500 on first fetch, with the offending path in the
        traceback. This is a considered design choice: failing fast
        at startup (e.g., by opening every registered file) would
        prevent the app from booting if a single optional resource
        is missing, which is the wrong behavior for a resource
        catalog that may grow to dozens of files over time.
        """
        self._registry = dict(registry)  # defensive copy

    async def fetch(self, name: str) -> Any:
        """
        Return the parsed JSON content of the named resource.

        Raises ResourceNotFoundError if the name is not in the registry.
        Lower-level errors (file missing on disk, invalid JSON) are
        allowed to propagate — see _read_json_sync docstring for why.
        """
        if name not in self._registry:
            raise ResourceNotFoundError(
                f"Resource {name!r} is not registered. "
                f"Known resources: {sorted(self._registry.keys())}"
            )
        path = self._registry[name]
        return await asyncio.to_thread(_read_json_sync, path)

    async def list_names(self) -> List[str]:
        """
        Return all registered resource names, sorted alphabetically.
        """
        return sorted(self._registry.keys())
