from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
import time

import httpx
from fastapi import Cookie, Header, HTTPException, Query, Request, status

from backend.app.core.config import settings
from backend.app.core.media_tokens import verify_media_token


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None
    access_token: str


_current_user: ContextVar[AuthenticatedUser | None] = ContextVar("clipforge_user", default=None)
_token_cache: dict[str, tuple[float, AuthenticatedUser]] = {}


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    clipforge_access_token: str | None = Cookie(default=None),
    media_token: str | None = Query(default=None),
) -> AuthenticatedUser:
    if media_token:
        user_id, project_id = verify_media_token(media_token)
        path = request.url.path
        if f"/projects/{project_id}/" not in path and not path.startswith("/api/jobs/output/"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Media link is not valid for this resource.")
        user = AuthenticatedUser(id=user_id, email=None, access_token="")
        _current_user.set(user)
        return user
    token = authorization.removeprefix("Bearer ").strip() if authorization and authorization.startswith("Bearer ") else clipforge_access_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bitte zuerst anmelden.")
    cached = _token_cache.get(token)
    if cached and cached[0] > time.monotonic():
        _current_user.set(cached[1])
        return cached[1]
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(status_code=503, detail="Supabase ist noch nicht konfiguriert.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={"apikey": settings.supabase_publishable_key, "Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Anmeldung konnte nicht geprüft werden.") from exc
    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sitzung abgelaufen. Bitte erneut anmelden.")
    payload = response.json()
    user = AuthenticatedUser(id=str(payload["id"]), email=payload.get("email"), access_token=token)
    _token_cache[token] = (time.monotonic() + 60, user)
    _current_user.set(user)
    return user


def current_user() -> AuthenticatedUser:
    user = _current_user.get()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bitte zuerst anmelden.")
    return user
