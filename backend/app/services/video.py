from __future__ import annotations

import json
import shutil
import subprocess
import re
import numpy as np
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path


class MediaInspectionError(ValueError):
    pass


@dataclass(frozen=True)
class VideoMetadata:
    duration: float
    width: int
    height: int
    fps: float
    codec: str


def _find_ffmpeg_tool(name: str) -> str:
    executable = shutil.which(name)
    if executable:
        return executable
    package_root = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
    candidates = sorted(package_root.glob(f"Gyan.FFmpeg_*/*/bin/{name}.exe"))
    if candidates:
        return str(candidates[-1])
    raise MediaInspectionError(f"{name} is not available. Run the setup script first.")


def _parse_fps(value: str | None) -> float:
    if not value or value in {"0/0", "N/A"}:
        return 0.0
    try:
        return round(float(Fraction(value)), 3)
    except (ValueError, ZeroDivisionError):
        return 0.0


def inspect_video(video_path: Path) -> VideoMetadata:
    command = [
        _find_ffmpeg_tool("ffprobe"),
        "-v", "error",
        "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate",
        "-of", "json",
        str(video_path),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=90, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise MediaInspectionError("The video could not be inspected.") from exc
    if result.returncode != 0:
        raise MediaInspectionError("The uploaded file is not a readable video.")
    try:
        payload = json.loads(result.stdout)
        video_stream = next(stream for stream in payload.get("streams", []) if stream.get("codec_type") == "video")
        duration = float(payload.get("format", {}).get("duration", 0))
        width = int(video_stream.get("width", 0))
        height = int(video_stream.get("height", 0))
        fps = _parse_fps(video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate"))
        codec = str(video_stream.get("codec_name") or "unknown")
    except (StopIteration, TypeError, ValueError, KeyError) as exc:
        raise MediaInspectionError("No valid video stream was found in this file.") from exc
    if duration <= 0 or width <= 0 or height <= 0:
        raise MediaInspectionError("The video has invalid or incomplete metadata.")
    return VideoMetadata(duration=round(duration, 3), width=width, height=height, fps=fps, codec=codec)


def analyze_reference_style(video_path: Path) -> dict[str, float | int | str]:
    metadata = inspect_video(video_path)
    command = [
        _find_ffmpeg_tool("ffmpeg"), "-hide_banner", "-i", str(video_path), "-t", f"{min(metadata.duration, 300):.3f}",
        "-vf", "scale=320:-2,select='gt(scene,0.32)',showinfo", "-an", "-f", "null", "-",
    ]
    scene_times: list[float] = []
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=600, check=False)
        scene_times = [float(value) for value in re.findall(r"pts_time:([0-9.]+)", result.stderr)]
    except (OSError, subprocess.TimeoutExpired):
        scene_times = []
    analyzed_duration = min(metadata.duration, 300)
    average_shot = analyzed_duration / max(len(scene_times) + 1, 1)
    sample_command = [_find_ffmpeg_tool("ffmpeg"), "-v", "error", "-i", str(video_path), "-t", f"{analyzed_duration:.3f}", "-vf", "fps=1/5,scale=320:180", "-frames:v", "60", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]
    frames = np.empty((0, 180, 320, 3), dtype=np.uint8)
    try:
        sample = subprocess.run(sample_command, capture_output=True, timeout=300, check=False)
        frame_bytes = 320 * 180 * 3
        count = len(sample.stdout) // frame_bytes
        if count:
            frames = np.frombuffer(sample.stdout[:count * frame_bytes], dtype=np.uint8).reshape(count, 180, 320, 3)
    except (OSError, subprocess.TimeoutExpired):
        pass
    brightness = float(frames.mean() / 255) if len(frames) else 0.5
    contrast = float(frames.std() / 128) if len(frames) else 0.5
    saturation = float((frames.max(axis=3) - frames.min(axis=3)).mean() / 255) if len(frames) else 0.35
    motion = float(np.abs(np.diff(frames.astype(np.int16), axis=0)).mean() / 255) if len(frames) > 1 else 0.0
    if len(frames):
        gray = frames.mean(axis=3)
        lower = gray[:, 105:, :]
        edges = (np.abs(np.diff(lower, axis=2)) > 38).mean()
        text_activity = float(min(edges * 7, 1))
    else:
        text_activity = 0.0
    ratio = metadata.width / max(metadata.height, 1)
    cuts_per_minute = len(scene_times) / max(analyzed_duration / 60, 0.1)
    recommended_font = "Anton" if cuts_per_minute >= 10 or motion >= 0.08 else "Bebas Neue" if text_activity >= 0.35 else "Montserrat" if contrast >= 0.55 else "Inter"
    style_summary = f"{'Schnell' if cuts_per_minute >= 10 else 'Ruhig'} geschnitten · {'kontrastreich' if contrast >= 0.55 else 'weich'} · {'textstark' if text_activity >= 0.35 else 'bildorientiert'}"
    return {
        "duration": metadata.duration,
        "width": metadata.width,
        "height": metadata.height,
        "fps": metadata.fps,
        "scene_count": len(scene_times),
        "average_shot_length": round(average_shot, 2),
        "target_clip_duration": round(min(max(metadata.duration, 15), 90), 2),
        "suggested_platform": "youtube" if ratio >= 1.3 else "shorts",
        "brightness": round(brightness, 3),
        "contrast": round(contrast, 3),
        "saturation": round(saturation, 3),
        "motion_score": round(motion, 3),
        "text_activity": round(text_activity, 3),
        "recommended_font": recommended_font,
        "style_summary": style_summary,
    }


def _audio_envelope(video_path: Path, seconds: float | None = None) -> np.ndarray:
    # Decode the complete soundtrack at a deliberately low sample rate.  This
    # keeps a feature vector for a 90 minute recording small while still giving
    # us 20 ms synchronization precision.
    command = [
        _find_ffmpeg_tool("ffmpeg"), "-v", "error", "-i", str(video_path),
        "-vn", "-ac", "1", "-ar", "1000",
    ]
    if seconds is not None:
        command += ["-t", str(seconds)]
    command += ["-f", "f32le", "-"]
    result = subprocess.run(command, capture_output=True, timeout=900, check=False)
    if result.returncode != 0 or not result.stdout:
        raise MediaInspectionError("No usable audio was found for automatic synchronization.")
    audio = np.frombuffer(result.stdout, dtype=np.float32)
    usable = len(audio) // 20 * 20
    if usable < 500:
        raise MediaInspectionError("The shared audio is too short for synchronization.")
    frames = audio[:usable].reshape(-1, 20)
    envelope = np.sqrt(np.mean(np.square(frames), axis=1) + 1e-12)
    envelope = np.log1p(envelope * 50.0)
    # Remove slow microphone/volume changes so shared speech, music and cuts
    # dominate the match instead of the overall loudness of either recording.
    window_size = min(251, max(3, len(envelope) // 20 * 2 + 1))
    trend = np.convolve(envelope, np.ones(window_size) / window_size, mode="same")
    envelope -= trend
    envelope -= envelope.mean()
    scale = float(np.linalg.norm(envelope))
    return envelope / max(scale, 1e-8)


def _correlate_audio_envelopes(main: np.ndarray, reaction: np.ndarray) -> tuple[float, float]:
    size = len(main) + len(reaction) - 1
    fft_size = 1 << (size - 1).bit_length()
    correlation = np.fft.irfft(np.fft.rfft(main, fft_size) * np.fft.rfft(reaction[::-1], fft_size), fft_size)[:size]
    index = int(np.argmax(correlation))
    lag = index - (len(reaction) - 1)
    offset = round(-lag / 50, 3)
    confidence = round(float(np.max(correlation)) * 100, 1)
    return offset, max(0.0, min(confidence, 100.0))


def _alignment_consistency(main: np.ndarray, reaction: np.ndarray, offset: float) -> float:
    """Confirm that a global audio peak remains valid across the timeline."""
    offset_frames = int(round(offset * 50))
    window = 30 * 50
    scores: list[float] = []
    for fraction in (0.08, 0.25, 0.5, 0.75, 0.92):
        reaction_start = int((len(reaction) - window) * fraction)
        main_start = reaction_start - offset_frames
        if reaction_start < 0 or main_start < 0:
            continue
        if reaction_start + window > len(reaction) or main_start + window > len(main):
            continue
        left = main[main_start:main_start + window]
        right = reaction[reaction_start:reaction_start + window]
        denominator = float(np.linalg.norm(left) * np.linalg.norm(right))
        if denominator > 1e-10:
            scores.append(float(np.dot(left, right) / denominator))
    return float(np.median(scores)) if len(scores) >= 3 else 0.0


def synchronize_reaction(main_path: Path, reaction_path: Path) -> tuple[float, float]:
    main_metadata = inspect_video(main_path)
    reaction_metadata = inspect_video(reaction_path)
    main = _audio_envelope(main_path)
    reaction = _audio_envelope(reaction_path)
    offset, confidence = _correlate_audio_envelopes(main, reaction)

    consistency = _alignment_consistency(main, reaction, offset)
    reliable_audio_match = confidence >= 35 and consistency >= 0.22

    # Multicam exports often contain entirely different audio tracks while
    # sharing the same zero point. A weak accidental peak must never move that
    # timeline (source soundtrack and host-only microphone are a common case).
    frame_tolerance = max(0.12, 2 / max(main_metadata.fps or 25, 1))
    duration_gap = abs(main_metadata.duration - reaction_metadata.duration)
    compatible_timeline = duration_gap <= max(120.0, main_metadata.duration * 0.03)
    if not reliable_audio_match:
        return 0.0, 90.0 if compatible_timeline else 35.0
    if abs(offset) <= frame_tolerance:
        return 0.0, max(confidence, 95.0)
    verified_confidence = min(100.0, round(confidence * 0.7 + consistency * 100 * 0.3, 1))
    return offset, verified_confidence


def create_thumbnail(video_path: Path, output_path: Path, duration: float) -> None:
    seek_time = min(max(duration * 0.1, 0.0), 10.0)
    command = [
        _find_ffmpeg_tool("ffmpeg"),
        "-y", "-ss", f"{seek_time:.3f}", "-i", str(video_path),
        "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", str(output_path),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise MediaInspectionError("A thumbnail could not be generated.") from exc
    if result.returncode != 0 or not output_path.is_file():
        raise MediaInspectionError("A thumbnail could not be generated from this video.")


def create_timeline_frame(video_path: Path, output_path: Path, timestamp: float) -> None:
    command = [
        _find_ffmpeg_tool("ffmpeg"), "-y", "-ss", f"{timestamp:.3f}", "-i", str(video_path),
        "-frames:v", "1", "-vf", "scale=320:180:force_original_aspect_ratio=increase,crop=320:180",
        "-q:v", "4", str(output_path),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=90, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise MediaInspectionError("Timeline frame generation failed.") from exc
    if result.returncode != 0 or not output_path.is_file():
        raise MediaInspectionError("Timeline frame generation failed.")
