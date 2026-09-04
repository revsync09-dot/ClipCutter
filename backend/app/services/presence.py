from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import threading
import time

from fastapi import Request

from backend.app.core.auth import AuthenticatedUser
from backend.app.core.config import settings


ACTIVE_WINDOW_SECONDS = 90
RETENTION_HOURS = 24
_lock = threading.Lock()
_active_users: dict[str, datetime] = {}
_last_prune = 0.0


def presence_log_path() -> Path:
    return settings.storage_path / "logs" / "presence.ndjson"


def client_ip(request: Request) -> str:
    """Return the address supplied by the public proxy, with a safe fallback."""
    forwarded = request.headers.get("cf-connecting-ip")
    if not forwarded:
        forwarded = (request.headers.get("x-forwarded-for") or "").split(",", 1)[0].strip()
    address = forwarded or (request.client.host if request.client else "unknown")
    return address.replace("\r", "").replace("\n", "")[:64]


def _prune_log(now: datetime, log_path: Path, *, force: bool = False) -> None:
    global _last_prune
    if (not force and time.monotonic() - _last_prune < 3600) or not log_path.exists():
        return
    _last_prune = time.monotonic()
    cutoff = now - timedelta(hours=RETENTION_HOURS)
    kept: list[str] = []
    for line in log_path.read_text(encoding="utf-8").splitlines():
        try:
            payload = json.loads(line)
            timestamp = datetime.fromisoformat(payload["seen_at"])
            if timestamp >= cutoff:
                kept.append(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            continue
    temporary = log_path.with_suffix(".tmp")
    temporary.write_text(("\n".join(kept) + "\n") if kept else "", encoding="utf-8")
    temporary.replace(log_path)


def prune_expired_presence() -> None:
    """Enforce retention even when nobody is currently using the site."""
    with _lock:
        _prune_log(datetime.now(timezone.utc), presence_log_path(), force=True)


def record_presence(user: AuthenticatedUser, request: Request, page: str) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    safe_page = (page or "/").replace("\r", "").replace("\n", "")[:240]
    entry = {
        "seen_at": now.isoformat(),
        "user_id": user.id,
        "email": user.email,
        "ip": client_ip(request),
        "page": safe_page,
    }
    log_path = presence_log_path()
    with _lock:
        cutoff = now - timedelta(seconds=ACTIVE_WINDOW_SECONDS)
        expired = [user_id for user_id, seen_at in _active_users.items() if seen_at < cutoff]
        for user_id in expired:
            _active_users.pop(user_id, None)
        _active_users[user.id] = now
        log_path.parent.mkdir(parents=True, exist_ok=True)
        _prune_log(now, log_path)
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
        active_count = len(_active_users)
    identity = user.email or user.id
    print(
        f"[LIVE] {now.astimezone().strftime('%H:%M:%S')} | {identity} | "
        f"IP {entry['ip']} | {safe_page} | online {active_count}",
        flush=True,
    )
    return {"seen_at": entry["seen_at"], "active_users": active_count}
