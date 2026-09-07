from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.core.config import settings


@dataclass(frozen=True)
class R2Upload:
    upload_id: str
    key: str
    part_size: int
    part_urls: list[dict[str, object]]


def is_configured() -> bool:
    return bool(settings.r2_endpoint and settings.r2_access_key_id and settings.r2_secret_access_key and settings.r2_bucket)


def _client():
    import boto3
    from botocore.config import Config as BotocoreConfig

    if not is_configured():
        raise RuntimeError("Cloudflare R2 is not configured")
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=BotocoreConfig(
            signature_version="s3v4",
            connect_timeout=15,
            read_timeout=30,
            retries={"max_attempts": 2, "mode": "standard"},
            s3={"addressing_style": "path"},
        ),
    )


def start_multipart(key: str, content_type: str, part_count: int) -> R2Upload:
    client = _client()
    part_size = settings.r2_part_size
    result = client.create_multipart_upload(Bucket=settings.r2_bucket, Key=key, ContentType=content_type or "video/mp4")
    upload_id = str(result["UploadId"])
    urls = [
        {
            "part_number": number,
            "url": client.generate_presigned_url(
                "upload_part",
                Params={"Bucket": settings.r2_bucket, "Key": key, "UploadId": upload_id, "PartNumber": number},
                ExpiresIn=settings.r2_url_expiry,
                HttpMethod="PUT",
            ),
        }
        for number in range(1, part_count + 1)
    ]
    return R2Upload(upload_id, key, part_size, urls)


def complete_multipart(upload_id: str, key: str, parts: list[dict[str, object]]) -> None:
    normalized = [{"ETag": str(part["etag"]), "PartNumber": int(part["part_number"])} for part in parts]
    normalized.sort(key=lambda part: int(part["PartNumber"]))
    _client().complete_multipart_upload(
        Bucket=settings.r2_bucket,
        Key=key,
        UploadId=upload_id,
        MultipartUpload={"Parts": normalized},
    )


def abort_multipart(upload_id: str, key: str) -> None:
    _client().abort_multipart_upload(Bucket=settings.r2_bucket, Key=key, UploadId=upload_id)


def download_to_path(key: str, destination) -> None:
    _client().download_file(settings.r2_bucket, key, str(destination))


def delete_object(key: str) -> None:
    _client().delete_object(Bucket=settings.r2_bucket, Key=key)
