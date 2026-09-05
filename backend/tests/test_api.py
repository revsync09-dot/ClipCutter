from io import BytesIO

from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest
from starlette.datastructures import Headers, UploadFile
from starlette.requests import Request

from backend.app.api.routes.projects import _video_extension, _video_extension_from_metadata
from backend.app.main import app
from backend.app.core.config import Settings
from backend.app.schemas.jobs import RenderRequest
from backend.app.services.rendering import _frame_opening, _has_audio_stream, _headline_metrics, _write_ass_captions, _write_headline_ass
from backend.app.services.headlines import generate_dual_headlines, generate_social_headline
from backend.app.services.video import _correlate_audio_envelopes
from backend.app.services.presence import client_ip
from backend.app.core.media_tokens import create_media_token, verify_media_token
from fastapi import HTTPException
import numpy as np
import cv2


def test_reaction_audio_probe_rejects_missing_file(tmp_path) -> None:
    assert _has_audio_stream(tmp_path / "missing.mp4") is False


def test_frame_opening_detects_enclosed_transparent_area(tmp_path) -> None:
    image = np.zeros((100, 160, 4), dtype=np.uint8)
    cv2.rectangle(image, (20, 15), (140, 85), (255, 255, 255, 255), 6)
    path = tmp_path / "frame.png"
    cv2.imwrite(str(path), image)
    assert _frame_opening(path) == (24, 19, 113, 63)


def test_health() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


def test_presence_uses_cloudflare_client_address() -> None:
    request = Request({
        "type": "http",
        "headers": [(b"cf-connecting-ip", b"203.0.113.42"), (b"x-forwarded-for", b"198.51.100.8")],
        "client": ("127.0.0.1", 5173),
    })
    assert client_ip(request) == "203.0.113.42"


def test_presence_requires_authentication() -> None:
    with TestClient(app) as client:
        response = client.post("/api/presence/heartbeat", json={"page": "/"})
        assert response.status_code == 401


def test_projects_require_authentication() -> None:
    with TestClient(app) as client:
        response = client.get("/api/projects")
        assert response.status_code == 401


def test_media_token_is_scoped_and_rejects_tampering() -> None:
    token = create_media_token("user-id", "project-id")
    assert verify_media_token(token) == ("user-id", "project-id")
    with pytest.raises(HTTPException):
        verify_media_token(f"{token}x")


def test_cors_origin_list_is_explicit() -> None:
    config = Settings(cors_origins="https://clipforge.example,http://localhost:5173")
    assert config.allowed_origins == ["https://clipforge.example", "http://localhost:5173"]


def test_production_cors_includes_stable_vercel_aliases() -> None:
    config = Settings(env="production", cors_origins="https://clipforge.example")
    assert config.allowed_origins == [
        "https://clipforge.example",
        "https://frontend-mu-flame-44.vercel.app",
        "https://frontend-red-thzs-projects.vercel.app",
    ]


def test_owner_requires_matching_id_and_exact_email() -> None:
    config = Settings(owner_user_ids="owner-id", owner_emails="subhan.qasimi112@gmail.com")
    assert config.is_owner("owner-id", "SUBHAN.QASIMI112@gmail.com") is True
    assert config.is_owner("owner-id", "someone@example.com") is False
    assert config.is_owner("different-id", "subhan.qasimi112@gmail.com") is False


def test_examples_returns_a_list() -> None:
    with TestClient(app) as client:
        response = client.get("/api/examples")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


def test_audio_sync_finds_reaction_start_after_main() -> None:
    main = np.zeros(500, dtype=np.float32)
    reaction = np.zeros(500, dtype=np.float32)
    main[100:105] = [0.2, 0.7, 1.0, 0.4, 0.1]
    reaction[125:130] = [0.2, 0.7, 1.0, 0.4, 0.1]
    offset, confidence = _correlate_audio_envelopes(main, reaction)
    assert offset == 0.5
    assert confidence == 100.0


def test_examples_upload_requires_authentication() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/examples",
            files={"file": ("example.txt", b"not a video", "text/plain")},
        )
        assert response.status_code == 401


def test_video_type_recovers_missing_mp4_extension() -> None:
    upload = UploadFile(
        file=BytesIO(b""),
        filename="reaction-video",
        headers=Headers({"content-type": "video/mp4"}),
    )
    assert _video_extension(upload, "reaction-video") == ".mp4"


def test_chunked_upload_recovers_extension_from_content_type() -> None:
    assert _video_extension_from_metadata("stream-export", "video/mp4") == ".mp4"
    assert _video_extension_from_metadata("stream.exe", "application/octet-stream") is None


def test_rejects_unsupported_upload() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/projects/upload",
            files={"file": ("unsafe.exe", b"not a video", "application/octet-stream")},
        )
        assert response.status_code == 401


def test_rejects_unreadable_video() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/projects/upload",
            files={"file": ("broken.mp4", b"not a video", "video/mp4")},
        )
        assert response.status_code == 401


def test_render_request_accepts_editable_clean_headline() -> None:
    request = RenderRequest(
        start=0,
        end=30,
        headline="500K mit nur einem Produkt?!",
        headline_style="clean",
        headline_position="split",
        headline_size=72,
        headline_font="Montserrat",
        headline_text_color="#FF2030",
        headline_background_color="#FFF8F0",
        main_format="square",
    )
    assert request.headline_font == "Montserrat"
    assert request.headline_size == 72
    assert request.main_format == "square"
    assert request.headline_text_color == "#FF2030"


def test_render_request_accepts_independent_overlay_positions() -> None:
    request = RenderRequest(
        start=0, end=30, caption_x=42, caption_y=61,
        headline_x=34, headline_y=28,
        secondary_headline="ECHTE REAKTION", secondary_headline_x=71, secondary_headline_y=16,
        blur_strength=45, background_dim=22,
    )
    assert (request.caption_x, request.caption_y) == (42, 61)
    assert (request.headline_x, request.headline_y) == (34, 28)
    assert (request.secondary_headline_x, request.secondary_headline_y) == (71, 16)


def test_render_request_rejects_invalid_headline_controls() -> None:
    with pytest.raises(ValidationError):
        RenderRequest(start=0, end=30, headline_style="unsafe", headline_size=200)
    with pytest.raises(ValidationError):
        RenderRequest(start=0, end=30, headline_text_color="red")


@pytest.mark.parametrize("style", ["clean", "dark", "capsule", "bubble", "glass", "minimal"])
def test_render_request_accepts_all_headline_shapes(style: str) -> None:
    assert RenderRequest(start=0, end=30, headline_style=style).headline_style == style


def test_headline_wraps_three_words_per_line_without_dropping_words() -> None:
    lines, _, _, _ = _headline_metrics(
        "eins zwei drei vier fünf sechs sieben acht neun zehn",
        1080,
        1920,
        "reaction_top",
        "split",
        64,
    )
    assert lines == ["EINS ZWEI DREI", "VIER FÜNF SECHS", "SIEBEN ACHT NEUN", "ZEHN"]


def test_headline_preserves_manual_line_breaks() -> None:
    lines, _, _, _ = _headline_metrics(
        "erste eigene Zeile\nzweite Zeile\ndritte Zeile",
        1080,
        1920,
        "reaction_top",
        "split",
        64,
    )
    assert lines == ["ERSTE EIGENE ZEILE", "ZWEITE ZEILE", "DRITTE ZEILE"]


@pytest.mark.parametrize(
    ("platform", "expected"),
    [
        ("tiktok", "SO VERDIENST DU SCHNELLER GELD"),
        ("instagram", "SCHNELLER GELD VERDIENEN DAS ZÄHLT"),
        ("shorts", "WIE SCHNELL KANN MAN GELD VERDIENEN?"),
        ("youtube", "SCHNELLER GELD VERDIENEN WAS WIRKLICH ZÄHLT"),
    ],
)
def test_headline_generator_adapts_money_hook_to_platform(platform: str, expected: str) -> None:
    assert generate_social_headline("Verdient man sehr schnell Geld?", platform) == expected


def test_headline_generator_uses_grounded_brand_and_question_hooks() -> None:
    assert generate_social_headline("3CC hat richtig abkassiert.", "shorts") == "SO KASSIERT 3CC RICHTIG AB"
    assert generate_social_headline(
        "Aber geht es wirklich auch, wenn man nur ganz wenig Zeit investiert?",
        "shorts",
    ) == "WENIG ZEIT GEHT DAS WIRKLICH?"


def test_dual_headlines_are_distinct_and_topic_grounded() -> None:
    main, reaction = generate_dual_headlines("Der größte Fehler kostet bei diesem Produkt 700 Euro.", "shorts")
    assert main != reaction
    assert "700" in main or "PRODUKT" in main
    assert "FEHLER" in reaction


def test_ass_overlays_write_exact_percent_positions(tmp_path) -> None:
    headline_path = tmp_path / "headline.ass"
    caption_path = tmp_path / "caption.ass"
    _write_headline_ass(headline_path, "TEST", 2, 1080, 1920, position_x=35, position_y=22)
    _write_ass_captions(
        caption_path,
        [{"start": 0, "end": 2, "text": "Caption Test", "words": []}],
        0, 2, "bold", False, 4, position_x=60, position_y=55,
    )
    assert r"\pos(378,422)" in headline_path.read_text(encoding="utf-8-sig")
    assert r"\pos(648,1056)" in caption_path.read_text(encoding="utf-8-sig")
