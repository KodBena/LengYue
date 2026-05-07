"""
tests/fakes/

Port-shaped in-memory fakes for the six backend Ports plus the
position-normalizer Port.

The Ports themselves are declared as Python ``Protocol`` classes in
``repositories/ports.py`` and ``domain/normalizer.py``. Any object
matching the structural interface satisfies the Port — these fakes
exist so a service-level test can drive a use case to completion
without any database, any SQLAlchemy session, or any I/O.

Pattern:

  - One module per Port; one class per fake. State is held in plain
    Python dicts and lists; methods compute results in pure Python.

  - Tenancy is honored where relevant. The fakes apply the same
    ``user_id`` filter the SQLAlchemy adapters do, so a service
    test exercising the 404-not-403 invariant gets the same
    behaviour from a fake as it would from production.

  - No partial-implementations. Every method on the underlying
    Protocol is implemented; ``NotImplementedError`` is reserved
    for paths the underlying adapter wouldn't reach either.

License: Public Domain (The Unlicense)
"""
from tests.fakes.analysis_bundle_repository import FakeAnalysisBundleRepository
from tests.fakes.card_repository import FakeCardRepository
from tests.fakes.lineage_repository import FakeLineageRepository
from tests.fakes.normalizer import FakeNormalizer
from tests.fakes.resource_repository import FakeStaticResourceRepository
from tests.fakes.stats_repository import FakeStatsRepository
from tests.fakes.tag_filter_repository import FakeTagFilterRepository

__all__ = [
    "FakeAnalysisBundleRepository",
    "FakeCardRepository",
    "FakeLineageRepository",
    "FakeNormalizer",
    "FakeStaticResourceRepository",
    "FakeStatsRepository",
    "FakeTagFilterRepository",
]
