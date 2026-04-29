"""
core/config.py

Application configuration.

Settings are loaded from environment variables (with optional .env file support).
A few non-trivial behaviors are documented inline:

- SECRET_KEY: when not provided via env, a per-installation random key is
  generated and persisted to disk. See _load_or_generate_secret_key. This
  gives a transparent local install (no required configuration to start)
  without sacrificing JWT signature security across restarts.
- ALLOW_PASSWORDLESS_LOGIN: defaults to True for the transparent local-install
  use case. Multi-tenant operators flip this to False to require provisioned
  credentials.
- CORS_ALLOW_ORIGINS: defaults to ["*"]. Combined with allow_credentials=False
  in main.py (the JWT bearer token is not a CORS credential), this is
  spec-compliant. Operators with stricter policies override via env as a
  comma-separated list, e.g. CORS_ALLOW_ORIGINS='["https://go.example.org"]'.
- SQL_ECHO: defaults to False so SQL does not leak into stdout/logs in
  production. Local development can opt in via env.
- QEUBO_ENABLED: defaults to False. The qEUBO preference-based optimisation
  feature requires heavy optional deps (torch, botorch, gpytorch — see
  requirements-qeubo.txt) plus a running Redis instance. Researchers who
  want it set QEUBO_ENABLED=True after installing the deps; everyone else
  gets a backend with /qeubo/* routes returning 503 (the dispatch's
  documented disabled-state contract; see
  docs/dispatch/frontend-to-backend-qeubo-integration.md §2.2).

License: Public Domain (The Unlicense)
"""
import logging
import secrets
from pathlib import Path
from typing import List, Optional, Tuple

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


def _load_or_generate_secret_key(path: str) -> str:
    """
    Load a persistent secret key from disk, or generate and persist a new one.

    Auto-generation gives a transparent local install (no required configuration
    to start) without sacrificing security: the generated key is per-installation
    and persists across restarts. Operators of multi-tenant deployments should
    set SECRET_KEY in the environment instead, in which case this function is
    never called.
    """
    p = Path(path)

    # De-branding compat: an install that predates the .ebisu_secret_key →
    # .jwt_secret rename holds its JWT signing key in the legacy filename.
    # Renaming the file in place lets that install upgrade without
    # invalidating every JWT in the wild (which would log out every user
    # on first boot). Bounded shim per ADR-0002 exception #3 — remove
    # in a successor release once operators have had one upgrade cycle
    # to migrate. If both files exist (operator-managed override), the
    # configured target wins; the legacy file is left untouched.
    legacy = p.parent / ".ebisu_secret_key"
    if not p.exists() and legacy.exists():
        legacy.rename(p)
        logger.info(
            "SECRET_KEY: renamed legacy %s -> %s (de-branding compat)",
            legacy, p,
        )

    if p.exists():
        key = p.read_text().strip()
        if key:
            logger.info("SECRET_KEY: loaded persisted key from %s", p)
            return key

    key = secrets.token_urlsafe(64)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(key)
        try:
            p.chmod(0o600)
        except (NotImplementedError, OSError):
            # Non-POSIX filesystem; permissions are best-effort.
            pass
        logger.info("SECRET_KEY: generated new key and persisted to %s", p)
    except OSError as e:
        logger.warning(
            "SECRET_KEY: could not persist generated key to %s (%s). "
            "Using in-memory key for this process; all JWTs will invalidate "
            "on restart.",
            p, e,
        )
    return key


class Settings(BaseSettings):
    # ----- Database -----
    # Default to local SQLite for zero-config dev. main.py::lifespan applies
    # a one-time disk rename if a legacy ./ebisu.db exists alongside an
    # absent ./cards.db (de-branding compat; ADR-0002 exception #3).
    DATABASE_URI: str = "sqlite+aiosqlite:///./cards.db"
    SQL_ECHO: bool = False

    # ----- Ebisu Math -----
    EBISU_TARGET_RECALL: float = 0.8
    # 4 hours as the base time unit
    EBISU_TIME_UNIT: float = 14400.0
    EBISU_DEFAULT_MODEL: Tuple[float, float, float] = (3.0, 3.0, 1.0)

    # ----- Auth & Security -----
    # SECRET_KEY: if unset, _resolve_secret_key auto-generates and persists
    # one to SECRET_KEY_FILE. Set explicitly via env in multi-tenant deployments.
    SECRET_KEY: Optional[str] = None
    SECRET_KEY_FILE: str = "./.jwt_secret"
    # The single switch that flips the system between transparent local
    # install and multi-tenant deployment.
    #
    # When True (default — transparent-local-install mode):
    #   - The auth/token endpoint auto-provisions a `local_user` row on
    #     first request to an empty users table and issues a JWT for
    #     that user without requiring a password. Subsequent boots
    #     reuse that user.
    #   - Behavior is indistinguishable from a pre-tenancy single-user
    #     system; all data lives under user_id=1.
    #
    # When False (multi-tenant deployment):
    #   - Operators provision real `users` rows out-of-band; users
    #     authenticate with username + bcrypt-hashed password.
    #   - The passwordless auto-provision path is rejected.
    #
    # The flag affects authentication, not the tenancy spine itself —
    # every tenant-scoped read and write filters on user_id regardless
    # of which mode is active. The system-level tenancy model and the
    # operator pre-flight checklist for going multi-tenant live in
    # docs/notes/tenancy.md. The auth route that consumes this flag is
    # api/routes/auth.py::login_for_access_token.
    ALLOW_PASSWORDLESS_LOGIN: bool = True

    # ----- qEUBO (optional, opt-in for researchers) -----
    # The optimisation feature is gated behind this flag. Heavy deps
    # (torch/botorch/gpytorch) live in requirements-qeubo.txt and are not
    # installed by default. When False, /qeubo/* routes return 503 — the
    # dispatch-documented disabled-state contract.
    QEUBO_ENABLED: bool = False
    QEUBO_REDIS_URL: str = "redis://127.0.0.1:6379"

    # ----- HTTP -----
    # The JWT bearer token is not a CORS credential, so wildcard origin is
    # spec-compliant when allow_credentials=False (set in main.py).
    CORS_ALLOW_ORIGINS: List[str] = ["*"]

    model_config = SettingsConfigDict(env_file=".env")

    @model_validator(mode="after")
    def _resolve_secret_key(self) -> "Settings":
        if not self.SECRET_KEY:
            self.SECRET_KEY = _load_or_generate_secret_key(self.SECRET_KEY_FILE)
        else:
            logger.info("SECRET_KEY: using key supplied via environment")
        return self


config = Settings()
