from pathlib import Path
import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = PROJECT_ROOT / "backend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_prefix="CLIPFORGE_",
        extra="ignore",
    )

    env: str = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    frontend_port: int = 5173
    ollama_url: str = "http://127.0.0.1:11434"
    whisper_model: str = "small"
    # The CPU profile favors a much faster local model. CUDA machines keep the
    # more accurate model above, while ordinary laptops no longer spend close
    # to real time transcribing long streams.
    whisper_cpu_model: str = "base"
    open_browser: bool = True
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    owner_user_ids: str = ""
    owner_emails: str = ""
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    media_signing_secret: str = ""
    r2_endpoint: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""
    r2_part_size: int = 64 * 1024 * 1024
    r2_url_expiry: int = 3600

    @property
    def allowed_origins(self) -> list[str]:
        origins = [value.strip().rstrip("/") for value in self.cors_origins.split(",") if value.strip()]
        if self.env.casefold() == "production":
            # Vercel's production aliases stay stable even when an individual
            # deployment URL changes. Keep both aliases explicit so browsers
            # may upload directly to the Render cutter without opening CORS to
            # arbitrary third-party sites.
            origins.extend(
                (
                    "https://frontend-mu-flame-44.vercel.app",
                    "https://frontend-red-thzs-projects.vercel.app",
                )
            )
        return list(dict.fromkeys(origins))

    def is_owner(self, user_id: str, email: str | None) -> bool:
        allowed_ids = {value.strip() for value in self.owner_user_ids.split(",") if value.strip()}
        allowed_emails = {value.strip().casefold() for value in self.owner_emails.split(",") if value.strip()}
        normalized_email = (email or "").strip().casefold()
        # Both immutable Supabase user id and verified account email must match.
        # Knowing or reusing the URL alone never grants owner access.
        return bool(allowed_ids and allowed_emails and user_id in allowed_ids and normalized_email in allowed_emails)

    database_path: Path = BACKEND_ROOT / "database" / "clipforge.db"
    storage_path: Path = BACKEND_ROOT / "storage"

    def ensure_directories(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        for folder in ("uploads", "outputs", "thumbnails", "transcripts", "captions", "previews", "timeline", "references", "reactions", "frames", "examples"):
            (self.storage_path / folder).mkdir(parents=True, exist_ok=True)


settings = Settings()

# Development works without extra setup. Production deployments must provide a
# stable secret so media links remain valid across process restarts.
if settings.env.casefold() == "production" and not settings.media_signing_secret:
    raise RuntimeError("CLIPFORGE_MEDIA_SIGNING_SECRET is required in production")
if not settings.media_signing_secret:
    settings.media_signing_secret = secrets.token_urlsafe(48)
