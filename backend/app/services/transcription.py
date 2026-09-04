from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from sqlalchemy import delete

from backend.app.core.config import settings
from backend.app.core.database import SessionLocal
from backend.app.models import Transcript
from backend.app.services.rendering import ProgressCallback
from backend.app.services.video import MediaInspectionError, _find_ffmpeg_tool


def transcribe_video(project_id: str, video_path: Path, progress: ProgressCallback) -> dict[str, str | None]:
    try:
        import ctranslate2
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise MediaInspectionError("faster-whisper is not installed correctly") from exc

    # FLAC keeps the speech lossless but avoids creating an enormous raw WAV
    # (an eight-hour mono WAV would be close to one gigabyte).
    audio_path = (settings.storage_path / "transcripts" / f"{project_id}.flac").resolve()
    json_path = (settings.storage_path / "transcripts" / f"{project_id}.json").resolve()
    progress(2, "Extracting clear speech audio")

    import subprocess

    command = [
        _find_ffmpeg_tool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(video_path), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "flac", "-compression_level", "8", str(audio_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0 or not audio_path.is_file():
        raise MediaInspectionError("No readable speech audio was found in this video")

    try:
        has_cuda = ctranslate2.get_cuda_device_count() > 0
        device = "cuda" if has_cuda else "cpu"
        compute_type = "float16" if has_cuda else "int8"
        model_name = settings.whisper_model if has_cuda else settings.whisper_cpu_model
        cpu_threads = max(4, min(12, (os.cpu_count() or 6) - 2))
        progress(7, f"Spracherkennung ({model_name}) wird vorbereitet")
        model = WhisperModel(
            model_name,
            device=device,
            compute_type=compute_type,
            cpu_threads=cpu_threads,
            num_workers=1,
        )
        progress(9, "Tonspur wird in schnelle Analyseblöcke aufgeteilt")
        segments_iter, info = model.transcribe(
            str(audio_path),
            beam_size=1,
            best_of=1,
            temperature=0,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 450},
            word_timestamps=True,
            condition_on_previous_text=False,
        )
        duration = max(float(getattr(info, "duration", 0) or 0), 1)
        segments: list[dict[str, Any]] = []
        for segment in segments_iter:
            words = [
                {"start": round(float(word.start), 3), "end": round(float(word.end), 3), "word": word.word.strip()}
                for word in (segment.words or [])
                if word.start is not None and word.end is not None and word.word.strip()
            ]
            item = {
                "start": round(float(segment.start), 3),
                "end": round(float(segment.end), 3),
                "text": segment.text.strip(),
                "words": words,
            }
            if item["text"]:
                segments.append(item)
            progress(10 + min(float(segment.end) / duration, 1) * 86, "Gesprochene Stellen werden analysiert")

        if not segments:
            raise MediaInspectionError("Whisper could not detect spoken words in this video")
        language = str(getattr(info, "language", "unknown") or "unknown")
        payload = {"language": language, "segments": segments, "full_text": " ".join(item["text"] for item in segments)}
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        with SessionLocal() as session:
            session.execute(delete(Transcript).where(Transcript.project_id == project_id))
            session.add(Transcript(project_id=project_id, language=language, full_text=payload["full_text"], segments_json=json.dumps(segments, ensure_ascii=False)))
            session.commit()
        progress(99, "Transkript mit exakten Wortzeiten gespeichert")
        return {}
    finally:
        audio_path.unlink(missing_ok=True)
