from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[3]
REPO_ROOT = BACKEND_DIR.parent

load_dotenv(REPO_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env")


def _normalize_domain(domain: str | None) -> str | None:
    if not domain:
        return None
    return domain.removeprefix("https://").rstrip("/")


def _parse_origins(origins: str | None) -> tuple[str, ...]:
    if not origins:
        return ("http://localhost:3000", "http://127.0.0.1:3000")
    return tuple(origin.strip() for origin in origins.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    auth0_domain: str | None
    auth0_audience: str | None
    cors_origins: tuple[str, ...]

    @property
    def auth0_enabled(self) -> bool:
        return bool(self.auth0_domain and self.auth0_audience)

    @property
    def auth0_issuer(self) -> str | None:
        if not self.auth0_domain:
            return None
        return f"https://{self.auth0_domain}/"

    @property
    def auth0_jwks_url(self) -> str | None:
        if not self.auth0_issuer:
            return None
        return f"{self.auth0_issuer}.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings(
        auth0_domain=_normalize_domain(os.getenv("AUTH0_DOMAIN")),
        auth0_audience=os.getenv("AUTH0_AUDIENCE"),
        cors_origins=_parse_origins(os.getenv("CORS_ORIGINS")),
    )
