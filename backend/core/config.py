"""
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
    # Default to local SQLite for zero-config dev
    DATABASE_URI: str = "sqlite+aiosqlite:///./ebisu.db"
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
    SECRET_KEY_FILE: str = "./.ebisu_secret_key"
    API_TOKEN_NAME: str = "X-Ebisu-Token"
    # The single switch that flips the system between transparent local install
    # and multi-tenant deployment. See api/routes/auth.py::login_for_access_token.
    ALLOW_PASSWORDLESS_LOGIN: bool = True

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
