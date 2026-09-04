from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from fastapi import HTTPException, status

from backend.app.core.config import settings


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_media_token(user_id: str, project_id: str, ttl_seconds: int = 6 * 60 * 60) -> str:
    payload = _encode(json.dumps({
        "uid": user_id,
        "pid": project_id,
        "exp": int(time.time()) + ttl_seconds,
    }, separators=(",", ":")).encode("utf-8"))
    signature = _encode(hmac.new(
        settings.media_signing_secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256,
    ).digest())
    return f"{payload}.{signature}"


def verify_media_token(token: str) -> tuple[str, str]:
    try:
        payload, supplied_signature = token.split(".", 1)
        expected_signature = _encode(hmac.new(
            settings.media_signing_secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256,
        ).digest())
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise ValueError("signature")
        data = json.loads(_decode(payload))
        user_id, project_id = str(data["uid"]), str(data["pid"])
        if int(data["exp"]) < int(time.time()):
            raise ValueError("expired")
        return user_id, project_id
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Media link expired. Reload the page and try again.",
        ) from exc
