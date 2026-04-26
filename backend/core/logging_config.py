"""
Centralized logging configuration.

Logging configuration is an *entry-point* concern, not a domain concern.
This module exposes one function — `configure_logging` — that every
entry point (the FastAPI app in main.py, each script's __main__ block)
calls exactly once at startup. Domain and infrastructure modules use
`logging.getLogger(__name__)` and never configure: they're
configuration-passive consumers, exactly like they're already
configuration-passive about the database URI.

Two styles supported:

- "application": full format with timestamp, level, and logger name.
  Used by the FastAPI server (main.py) where the log is the primary
  observability surface for debugging deployed instances.

- "cli": message-only format. Used by interactive scripts where the
  user is reading streaming output and timestamps are noise. Equivalent
  to print() for the message body, but routed through the logging
  subsystem so level filtering still works (e.g., set level=WARNING
  to silence progress noise during automated runs).

A future "json" style for log-aggregator-friendly output is the natural
extension point; add it here without touching any call site.
"""
import logging
import sys
from typing import Literal


_APPLICATION_FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"
_CLI_FORMAT = "%(message)s"

FormatStyle = Literal["application", "cli"]


def configure_logging(
    level: int = logging.INFO,
    style: FormatStyle = "application",
) -> None:
    """
    Configure root logging. Idempotent: safe to call multiple times
    (force=True reinitializes any prior configuration).

    Should be called as early as possible in the entry point, before any
    imports that might emit log events at module load (e.g., core.config's
    SECRET_KEY resolution). main.py and each script in scripts/ both
    follow this discipline.
    """
    fmt = _APPLICATION_FORMAT if style == "application" else _CLI_FORMAT
    logging.basicConfig(
        level=level,
        format=fmt,
        stream=sys.stderr,
        force=True,
    )
