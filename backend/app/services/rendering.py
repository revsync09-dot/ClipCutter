from __future__ import annotations

import re
import subprocess
import textwrap
from pathlib import Path
from typing import Callable
from uuid import uuid4

import cv2

from backend.app.core.config import settings
from backend.app.services.video import MediaInspectionError, _find_ffmpeg_tool


ProgressCallback = Callable[[float, str], None]


def _media_dimensions(path: Path) -> tuple[int, int] | None:
    result = subprocess.run(
        [
            _find_ffmpeg_tool("ffprobe"),
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0:s=x",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    match = re.fullmatch(r"\s*(\d+)x(\d+)\s*", result.stdout)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def _has_audio_stream(path: Path) -> bool:
    result = subprocess.run(
        [
            _find_ffmpeg_tool("ffprobe"),
            "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=index",
            "-of", "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    return result.returncode == 0 and bool(result.stdout.strip())


def _frame_opening(path: Path) -> tuple[int, int, int, int] | None:
    """Return the largest enclosed transparent opening in a PNG/WebP frame."""
    image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if image is None or image.ndim != 3 or image.shape[2] < 4:
        return None
    alpha = image[:, :, 3]
    transparent = (alpha < 20).astype("uint8")
    count, _, stats, _ = cv2.connectedComponentsWithStats(transparent, 8)
    height, width = alpha.shape
    candidates: list[tuple[int, int, int, int, int]] = []
    for index in range(1, count):
        x, y, box_width, box_height, area = (int(value) for value in stats[index])
        if x > 0 and y > 0 and x + box_width < width and y + box_height < height:
            candidates.append((area, x, y, box_width, box_height))
    if not candidates:
        return None
    _, x, y, box_width, box_height = max(candidates)
    return x, y, box_width, box_height


def _run_ffmpeg(command: list[str], duration: float, progress: ProgressCallback, message: str) -> None:
    quiet_command = command[:1] + ["-hide_banner", "-loglevel", "error"] + command[1:]
    process = subprocess.Popen(
        quiet_command + ["-progress", "pipe:1", "-nostats"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    assert process.stdout is not None
    for line in process.stdout:
        if line.startswith("out_time_ms="):
            try:
                seconds = int(line.split("=", 1)[1]) / 1_000_000
                progress(min(seconds / max(duration, 0.1) * 100, 99), message)
            except ValueError:
                continue
    stderr = process.stderr.read() if process.stderr else ""
    if process.wait() != 0:
        raise MediaInspectionError(stderr.strip().splitlines()[-1] if stderr.strip() else "FFmpeg processing failed")


def create_hls_preview(project_id: str, video_path: Path, duration: float, progress: ProgressCallback) -> dict[str, str | None]:
    preview_dir = (settings.storage_path / "previews" / project_id).resolve()
    preview_dir.mkdir(parents=True, exist_ok=True)
    playlist = preview_dir / "index.m3u8"
    segment_pattern = preview_dir / "segment_%05d.ts"
    resume_at = 0.0
    segment_count = 0
    append = False
    if playlist.is_file():
        content = playlist.read_text(encoding="utf-8", errors="ignore")
        durations = [float(value) for value in re.findall(r"#EXTINF:([0-9.]+)", content)]
        segment_count = len(list(preview_dir.glob("segment_*.ts")))
        if durations and segment_count >= len(durations):
            resume_at = min(sum(durations), duration)
            segment_count = len(durations)
            append = resume_at < duration - 0.5
        else:
            for existing in preview_dir.glob("*"):
                if existing.is_file():
                    existing.unlink()
            segment_count = 0
    remaining = max(duration - resume_at, 0.1)
    command = [
        _find_ffmpeg_tool("ffmpeg"), "-y",
    ]
    if append:
        command += ["-ss", f"{resume_at:.3f}"]
    command += [
        "-i", str(video_path),
        "-map", "0:v:0", "-map", "0:a:0?",
        # The editor proxy is intentionally light. Limiting its CPU usage keeps
        # Smart Cut responsive when both jobs run at the same time.
        "-vf", "scale='min(960,iw)':-2:force_original_aspect_ratio=decrease,fps=24",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p", "-threads", "2",
        "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-ar", "48000",
        "-force_key_frames", "expr:gte(t,n_forced*4)",
        "-f", "hls", "-hls_time", "4", "-hls_list_size", "0", "-start_number", str(segment_count),
        "-hls_flags", ("append_list+independent_segments+temp_file" if append else "independent_segments+temp_file"),
        "-hls_segment_filename", str(segment_pattern), str(playlist),
    ]
    def preview_progress(value: float, message: str) -> None:
        completed = resume_at / max(duration, 0.1) * 100
        progress(min(completed + value * remaining / max(duration, 0.1), 99), "Continuing browser preview" if append else message)
    _run_ffmpeg(command, remaining, preview_progress, "Creating full browser preview with stereo audio")
    if not playlist.is_file():
        raise MediaInspectionError("Preview playlist was not created")
    return {"preview_url": f"/api/projects/{project_id}/preview/index.m3u8"}


def render_vertical_clip(
    project_id: str,
    video_path: Path,
    start: float,
    end: float,
    mode: str,
    fps: str,
    filename: str,
    progress: ProgressCallback,
    transcript_segments: list[dict[str, object]] | None = None,
    caption_style: str = "bold",
    caption_uppercase: bool = False,
    words_per_caption: int = 4,
    caption_animation: str = "pop",
    caption_x: float = 50,
    caption_y: float = 68,
    caption_size: int = 88,
    platform: str = "shorts",
    layout: str = "reaction_top",
    headline: str = "",
    reaction_path: Path | None = None,
    reaction_offset: float = 0.0,
    font_family: str = "Anton",
    headline_style: str = "clean",
    headline_position: str = "split",
    headline_size: int = 64,
    headline_font: str = "Montserrat",
    headline_text_color: str = "#EF1F1F",
    headline_background_color: str = "#FFFFFF",
    headline_x: float = 50,
    headline_y: float = 44,
    secondary_headline: str = "",
    secondary_headline_x: float = 50,
    secondary_headline_y: float = 18,
    blur_strength: int = 32,
    background_dim: int = 10,
    main_x: float = 50,
    main_y: float = 72,
    main_scale: float = 1,
    reaction_x_percent: float = 50,
    reaction_y_percent: float = 22,
    reaction_scale: float = 1,
    frame_x_percent: float = 50,
    frame_y_percent: float = 22,
    frame_scale: float = 1,
    social_safe_layout: bool = False,
    main_format: str = "source",
    frame_path: Path | None = None,
) -> dict[str, str | None]:
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-") or "clipforge-export"
    output_name = f"{safe_name}-{uuid4().hex[:8]}.mp4"
    output_path = (settings.storage_path / "outputs" / output_name).resolve()
    clip_duration = end - start
    output_width, output_height = (1920, 1080) if platform == "youtube" else (1080, 1920)
    # The owner social-safe preset is intentionally deterministic: on vertical
    # exports the reaction always owns the top edge, irrespective of an older
    # layout selection still present in the client state.
    if social_safe_layout and reaction_path is not None and output_height > output_width:
        layout = "reaction_top"
    filters: list[str] = []
    split_center_y: int | None = None
    stacked_layout = reaction_path is not None and layout in {"reaction_top", "main_focus", "main_top"}
    if stacked_layout:
        if output_height > output_width:
            top_height = int(output_height * (0.40 if social_safe_layout else 0.34 if layout == "main_focus" else 0.38))
            bottom_height = output_height - top_height
        else:
            top_height = output_height // 2
            bottom_height = output_height - top_height
        reaction_capacity = top_height if layout == "reaction_top" else bottom_height
        frame_width, frame_height = output_width, reaction_capacity
        frame_factor = 1.0
        opening = None
        if frame_path:
            frame_dimensions = _media_dimensions(frame_path)
            if frame_dimensions:
                source_width, source_height = frame_dimensions
                frame_factor = min(output_width / source_width, reaction_capacity / source_height)
                frame_width = max(2, int(source_width * frame_factor) // 2 * 2)
                frame_height = max(2, int(source_height * frame_factor) // 2 * 2)
                opening = _frame_opening(frame_path)
        # Keep the editorial spacing from the reference: reaction at the top,
        # headline on the split and the main video lower down. Every otherwise
        # unused pixel is supplied by the blurred full-canvas background.
        reaction_height = reaction_capacity
        main_height = output_height - reaction_height
        main_y = int(output_height * 0.42) if layout == "main_focus" else int(output_height * 0.38) if layout == "reaction_top" else 0
        reaction_y = 0 if layout == "reaction_top" else main_height
        split_center_y = main_y if layout == "reaction_top" else reaction_y
        frame_x = (output_width - frame_width) // 2
        frame_y = reaction_y + (reaction_height - frame_height) // 2
        if opening:
            open_x, open_y, open_width, open_height = opening
            scaled_open_x = int(open_x * frame_factor)
            scaled_open_y = int(open_y * frame_factor)
            scaled_open_width = max(2, int(open_width * frame_factor) // 2 * 2)
            scaled_open_height = max(2, int(open_height * frame_factor) // 2 * 2)
            # A detected custom-frame opening is authoritative. Do not apply a
            # second user scale afterwards: that was the source of the large
            # white/empty border at 72–88%.
            reaction_width = scaled_open_width
            reaction_inner_height = scaled_open_height
            reaction_x = frame_x + scaled_open_x
            reaction_video_y = frame_y + scaled_open_y
        else:
            reaction_width = max(2, int(frame_width * reaction_scale) // 2 * 2)
            reaction_inner_height = max(2, int(frame_height * reaction_scale) // 2 * 2)
            reaction_x = (output_width - reaction_width) // 2
            reaction_video_y = reaction_y + (reaction_height - reaction_inner_height) // 2
        filters += [
            "[0:v]split=2[fullbackground][mainforeground]",
            f"[fullbackground]scale={output_width}:{output_height}:force_original_aspect_ratio=increase,crop={output_width}:{output_height},boxblur={blur_strength}:{max(1, blur_strength // 4)},eq=brightness=-{background_dim / 200:.3f}[canvas]",
        ]
        if main_format == "fill" or layout == "main_focus" or layout == "reaction_top":
            filters.append(
            f"[mainforeground]scale={output_width}:{int(output_height * (0.34 if layout == 'main_focus' else 0.58))}:force_original_aspect_ratio=increase,crop={output_width}:{int(output_height * (0.34 if layout == 'main_focus' else 0.58))}[mainsharp]"
            )
        else:
            if main_format == "square":
                foreground_width = foreground_height = max(2, min(output_width, main_height) // 2 * 2)
                foreground_filter = f"scale={foreground_width}:{foreground_height}:force_original_aspect_ratio=increase,crop={foreground_width}:{foreground_height}"
            elif main_format == "portrait":
                foreground_height = max(2, main_height // 2 * 2)
                foreground_width = max(2, min(output_width, int(foreground_height * 4 / 5)) // 2 * 2)
                foreground_filter = f"scale={foreground_width}:{foreground_height}:force_original_aspect_ratio=increase,crop={foreground_width}:{foreground_height}"
            else:
                foreground_filter = f"scale={output_width}:{main_height}:force_original_aspect_ratio=decrease"
            filters.append(f"[mainforeground]{foreground_filter}[mainsharp]")
        main_video_y = main_y + (main_height - (foreground_height if main_format in {"square", "portrait"} else main_height)) // 2
        if layout == "main_focus":
            main_overlay_y = str(int(output_height * 0.42))
        elif layout == "reaction_top":
            main_overlay_y = str(int(output_height * 0.38))
        elif main_format == "source":
            main_overlay_y = f"{main_y}+{int(output_height * 0.025)}" if social_safe_layout else f"{main_y}+({main_height}-h)/2"
        else:
            main_overlay_y = str(main_video_y)
        filters.append(f"[canvas][mainsharp]overlay=(W-w)/2:{main_overlay_y}[tmpmain]")
        filters.append(
            f"[1:v]scale={reaction_width}:{reaction_inner_height}:force_original_aspect_ratio=increase,crop={reaction_width}:{reaction_inner_height}[reactionfit]"
        )
        filters.append(
            f"[tmpmain][reactionfit]overlay={reaction_x}:{reaction_video_y}[tmpreaction]"
        )
        reaction_label = "tmpreaction"
        if frame_path:
            filters += [
                f"[2:v]scale={frame_width}:{frame_height}:force_original_aspect_ratio=decrease[customframe]",
                f"[tmpreaction][customframe]overlay={frame_x}:{frame_y}:format=auto[reactionframed]",
            ]
            reaction_label = "reactionframed"
        filters.append(f"[{reaction_label}]null[base]")
    elif layout == "blur_center":
        filters += [
            "[0:v]split=2[background][main]",
            f"[background]scale={output_width}:{output_height}:force_original_aspect_ratio=increase,crop={output_width}:{output_height},boxblur=28:6[blurred]",
            f"[main]scale={output_width}:-2:force_original_aspect_ratio=decrease[mainsharp]",
            "[blurred][mainsharp]overlay=(W-w)/2:(H-h)/2[base]",
        ]
    elif mode == "crop":
        filters.append(f"[0:v]scale={output_width}:{output_height}:force_original_aspect_ratio=increase,crop={output_width}:{output_height}:(iw-ow)/2:(ih-oh)/2[base]")
    else:
        filters.append(f"[0:v]scale={output_width}:{output_height}:force_original_aspect_ratio=decrease,pad={output_width}:{output_height}:(ow-iw)/2:(oh-ih)/2:color=black[base]")
    current = "base"
    if reaction_path and layout == "picture_in_picture":
        reaction_width = 420 if output_width >= 1080 else int(output_width * 0.36)
        filters += [f"[1:v]scale={reaction_width}:-2:force_original_aspect_ratio=decrease[reaction]", f"[{current}][reaction]overlay=W-w-42:42[composite]"]
        current = "composite"
    caption_path: Path | None = None
    if transcript_segments:
        caption_path = (settings.storage_path / "captions" / f"{project_id}-{uuid4().hex[:8]}.ass").resolve()
        _write_ass_captions(caption_path, transcript_segments, start, end, caption_style, caption_uppercase, words_per_caption, output_width, output_height, font_family, caption_animation, caption_x, caption_y, caption_size)
        escaped_caption_path = str(caption_path).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
        fonts_dir = str(Path(__file__).resolve().parents[3] / "backend" / "assets" / "fonts").replace("\\", "/").replace(":", "\\:")
        filters.append(f"[{current}]subtitles='{escaped_caption_path}':fontsdir='{fonts_dir}'[captioned]")
        current = "captioned"
    headline_path: Path | None = None
    headline_box_path: Path | None = None
    if headline.strip():
        if headline_style != "minimal":
            headline_box_path = (settings.storage_path / "captions" / f"{project_id}-headline-box-{uuid4().hex[:8]}.ass").resolve()
            _write_headline_box_ass(
                headline_box_path, headline, clip_duration, output_width, output_height,
                layout, headline_style, headline_position, headline_size, headline_background_color, split_center_y, headline_x, headline_y,
            )
            escaped_box_path = str(headline_box_path).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
            filters.append(f"[{current}]subtitles='{escaped_box_path}'[headlinebox]")
            current = "headlinebox"
        headline_path = (settings.storage_path / "captions" / f"{project_id}-headline-{uuid4().hex[:8]}.ass").resolve()
        _write_headline_ass(
            headline_path, headline, clip_duration, output_width, output_height,
            headline_font, layout, headline_style, headline_position, headline_size, headline_text_color, split_center_y, headline_x, headline_y,
        )
        escaped_headline_path = str(headline_path).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
        fonts_dir = str(Path(__file__).resolve().parents[3] / "backend" / "assets" / "fonts").replace("\\", "/").replace(":", "\\:")
        filters.append(f"[{current}]subtitles='{escaped_headline_path}':fontsdir='{fonts_dir}'[vout]")
        current = "vout"
    secondary_headline_path: Path | None = None
    secondary_headline_box_path: Path | None = None
    if secondary_headline.strip():
        if headline_style != "minimal":
            secondary_headline_box_path = (settings.storage_path / "captions" / f"{project_id}-headline-2-box-{uuid4().hex[:8]}.ass").resolve()
            _write_headline_box_ass(
                secondary_headline_box_path, secondary_headline, clip_duration, output_width, output_height,
                layout, headline_style, "custom", headline_size, headline_background_color, None,
                secondary_headline_x, secondary_headline_y,
            )
            escaped_secondary_box = str(secondary_headline_box_path).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
            filters.append(f"[{current}]subtitles='{escaped_secondary_box}'[headline2box]")
            current = "headline2box"
        secondary_headline_path = (settings.storage_path / "captions" / f"{project_id}-headline-2-{uuid4().hex[:8]}.ass").resolve()
        _write_headline_ass(
            secondary_headline_path, secondary_headline, clip_duration, output_width, output_height,
            headline_font, layout, headline_style, "custom", headline_size, headline_text_color, None,
            secondary_headline_x, secondary_headline_y,
        )
        escaped_secondary = str(secondary_headline_path).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
        fonts_dir = str(Path(__file__).resolve().parents[3] / "backend" / "assets" / "fonts").replace("\\", "/").replace(":", "\\:")
        filters.append(f"[{current}]subtitles='{escaped_secondary}':fontsdir='{fonts_dir}'[headline2]")
        current = "headline2"
    main_has_audio = _has_audio_stream(video_path)
    reaction_has_audio = bool(reaction_path and _has_audio_stream(reaction_path))
    if main_has_audio and reaction_has_audio:
        filters += [
            "[0:a:0]aresample=async=1:first_pts=0,volume=0.75[mainaudio]",
            "[1:a:0]aresample=async=1:first_pts=0,volume=1.0[reactionaudio]",
            "[mainaudio][reactionaudio]amix=inputs=2:duration=longest:dropout_transition=2:normalize=0,alimiter=limit=0.95[aout]",
        ]
        audio_map = "[aout]"
        audio_filter: list[str] = []
    else:
        audio_input = 1 if reaction_has_audio else 0
        audio_map = f"{audio_input}:a:0?"
        audio_filter = ["-af", "aresample=async=1:first_pts=0,alimiter=limit=0.95"]

    command = [_find_ffmpeg_tool("ffmpeg"), "-y", "-ss", f"{start:.3f}", "-i", str(video_path)]
    if reaction_path:
        command += ["-ss", f"{max(0, start + reaction_offset):.3f}", "-i", str(reaction_path)]
    if frame_path and stacked_layout:
        command += ["-loop", "1", "-i", str(frame_path)]
    command += [
        "-t", f"{clip_duration:.3f}",
        "-filter_complex", ";".join(filters),
        "-map", f"[{current}]",
        "-map", audio_map,
    ]
    if fps != "original":
        command += ["-r", fps]
    command += [
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "256k", "-ac", "2", "-ar", "48000",
        *audio_filter, "-avoid_negative_ts", "make_zero",
        "-max_muxing_queue_size", "4096", "-movflags", "+faststart", str(output_path),
    ]
    try:
        _run_ffmpeg(command, clip_duration, progress, "Rendering social video with stereo audio")
    finally:
        if caption_path:
            caption_path.unlink(missing_ok=True)
        if headline_path:
            headline_path.unlink(missing_ok=True)
        if headline_box_path:
            headline_box_path.unlink(missing_ok=True)
        if secondary_headline_path:
            secondary_headline_path.unlink(missing_ok=True)
        if secondary_headline_box_path:
            secondary_headline_box_path.unlink(missing_ok=True)
    if not output_path.is_file():
        raise MediaInspectionError("Export file was not created")
    return {"output_url": f"/api/jobs/output/{output_name}"}


def _ass_time(seconds: float) -> str:
    value = max(0, seconds)
    hours = int(value // 3600)
    minutes = int(value % 3600 // 60)
    rest = value % 60
    return f"{hours}:{minutes:02d}:{rest:05.2f}"


def _ass_color(hex_color: str, alpha: str = "00") -> str:
    value = hex_color.lstrip("#")
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", value):
        value = "FFFFFF"
    red, green, blue = value[0:2], value[2:4], value[4:6]
    return f"&H{alpha}{blue}{green}{red}".upper()


def _headline_metrics(headline: str, width: int, height: int, layout: str, position: str, size: int, split_center_y: int | None = None) -> tuple[list[str], int, int, int]:
    safe = headline.strip().upper().replace("{", "(").replace("}", ")")
    lines: list[str] = []
    max_text_width = width - 180
    for manual_line in safe.splitlines() or [safe]:
        words = manual_line.split()
        current: list[str] = []
        for word in words:
            candidate = " ".join([*current, word])
            estimated_width = len(candidate) * size * 0.62
            if current and (len(current) >= 3 or estimated_width > max_text_width):
                lines.append(" ".join(current))
                current = [word]
            else:
                current.append(word)
        if current:
            lines.append(" ".join(current))
    lines = lines or [safe]
    if position == "top":
        center_y = max(100, int(size * 1.45))
    elif position == "bottom":
        center_y = height - max(130, int(size * 1.65))
    elif split_center_y is not None:
        center_y = split_center_y
    elif layout == "reaction_top":
        center_y = int(height * 0.44)
    elif layout == "main_top":
        center_y = int(height * 0.56)
    else:
        center_y = int(height * 0.14)
    box_width = min(width - 64, max(360, int(max(len(line) for line in lines) * size * 0.62 + 112)))
    box_height = int(len(lines) * size * 1.12 + 56)
    return lines, box_width, box_height, center_y


def _write_headline_ass(
    path: Path,
    headline: str,
    duration: float,
    width: int,
    height: int,
    font_family: str = "Montserrat",
    layout: str = "blur_center",
    style: str = "clean",
    position: str = "split",
    size: int = 64,
    text_color: str = "#EF1F1F",
    split_center_y: int | None = None,
    position_x: float = 50,
    position_y: float | None = None,
) -> None:
    lines, _, _, center_y = _headline_metrics(headline, width, height, layout, position, size, split_center_y)
    center_x = round(width * position_x / 100)
    if position_y is not None:
        center_y = round(height * position_y / 100)
    safe = r"\N".join(lines)
    primary = _ass_color(text_color)
    outline = "&H00140E18" if style == "minimal" else primary
    content = textwrap.dedent(f"""
        [Script Info]
        ScriptType: v4.00+
        PlayResX: {width}
        PlayResY: {height}
        ScaledBorderAndShadow: yes

        [V4+ Styles]
        Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
        Style: Headline,{font_family},{size},{primary},{primary},{outline},&H00000000,-1,0,0,0,100,100,-1,0,1,{3 if style == "minimal" else 1},0,5,60,60,0,1

        [Events]
        Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
        Dialogue: 0,0:00:00.00,{_ass_time(duration)},Headline,,0,0,0,,{{\\an5\\pos({center_x},{center_y})}}{safe}
    """).lstrip()
    path.write_text(content, encoding="utf-8-sig")


def _write_headline_box_ass(path: Path, headline: str, duration: float, width: int, height: int, layout: str, style: str, position: str, size: int, background_color: str = "#FFFFFF", split_center_y: int | None = None, position_x: float = 50, position_y: float | None = None) -> None:
    _, box_width, box_height, center_y = _headline_metrics(headline, width, height, layout, position, size, split_center_y)
    center_x = round(width * position_x / 100)
    if position_y is not None:
        center_y = round(height * position_y / 100)
    left, right = center_x - box_width // 2, center_x + box_width // 2
    top, bottom = center_y - box_height // 2, center_y + box_height // 2
    radius = {
        "capsule": box_height // 2,
        "bubble": min(72, box_height // 2),
        "glass": min(52, box_height // 2),
    }.get(style, min(64, box_height // 2))
    bottom_left_radius = min(18, radius) if style == "bubble" else radius
    shape = (
        f"m {left + radius} {top} l {right - radius} {top} "
        f"b {right - radius // 2} {top} {right} {top + radius // 2} {right} {top + radius} "
        f"l {right} {bottom - radius} b {right} {bottom - radius // 2} {right - radius // 2} {bottom} {right - radius} {bottom} "
        f"l {left + bottom_left_radius} {bottom} b {left + bottom_left_radius // 2} {bottom} {left} {bottom - bottom_left_radius // 2} {left} {bottom - bottom_left_radius} "
        f"l {left} {top + radius} b {left} {top + radius // 2} {left + radius // 2} {top} {left + radius} {top}"
    )
    color = _ass_color(background_color, "70" if style == "glass" else "04")
    content = textwrap.dedent(f"""
        [Script Info]
        ScriptType: v4.00+
        PlayResX: {width}
        PlayResY: {height}
        ScaledBorderAndShadow: yes

        [V4+ Styles]
        Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
        Style: Shadow,Arial,10,&H70000000,&H70000000,&H70000000,&H70000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
        Style: Box,Arial,10,{color},{color},{color},{color},0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

        [Events]
        Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
        Dialogue: 0,0:00:00.00,{_ass_time(duration)},Shadow,,0,0,0,,{{\\an7\\pos(5,10)\\p1}}{shape}
        Dialogue: 1,0:00:00.00,{_ass_time(duration)},Box,,0,0,0,,{{\\an7\\pos(0,0)\\p1}}{shape}
    """).lstrip()
    path.write_text(content, encoding="utf-8-sig")


def _write_ass_captions(path: Path, segments: list[dict[str, object]], clip_start: float, clip_end: float, style: str, uppercase: bool, words_per_caption: int, output_width: int = 1080, output_height: int = 1920, font_family: str = "Anton", animation: str = "pop", position_x: float = 50, position_y: float = 68, size_override: int | None = None) -> None:
    styles = {
        "minimal": (74, "&H00FFFFFF", "&H00101010", 3, 110),
        "bold": (92, "&H0000E7FF", "&H00170C20", 6, 150),
        "gaming": (92, "&H00FF73D2", "&H00400068", 7, 170),
        "creator": (86, "&H00FFFFFF", "&H009300FF", 8, 135),
        "karaoke": (88, "&H00DFF3A9", "&H00170C20", 6, 145),
        "boxed": (78, "&H0020142E", "&H00F7F5ED", 10, 125),
        "neon": (86, "&H00FF66EF", "&H005A00B8", 7, 145),
        "documentary": (68, "&H00FFFFFF", "&H00101010", 3, 105),
    }
    size, primary, outline, outline_width, margin_v = styles.get(style, styles["bold"])
    if size_override is not None:
        size = size_override
    header = textwrap.dedent(f"""
        [Script Info]
        ScriptType: v4.00+
        PlayResX: {output_width}
        PlayResY: {output_height}
        WrapStyle: 2
        ScaledBorderAndShadow: yes

        [V4+ Styles]
        Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
        Style: Caption,{font_family},{size},{primary},&H00FFFFFF,{outline},&H78000000,-1,0,0,0,100,100,0,0,1,{outline_width},2,2,70,70,{margin_v},1

        [Events]
        Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    """).lstrip()
    events: list[str] = []
    caption_x = round(output_width * position_x / 100)
    caption_y = round(output_height * position_y / 100)
    for segment in segments:
        seg_start = float(segment.get("start", 0))
        seg_end = float(segment.get("end", 0))
        if seg_end <= clip_start or seg_start >= clip_end:
            continue
        words = list(segment.get("words", []) or [])
        if not words:
            raw_words = str(segment.get("text", "")).split()
            span = max(seg_end - seg_start, 0.1) / max(len(raw_words), 1)
            words = [{"word": word, "start": seg_start + index * span, "end": seg_start + (index + 1) * span} for index, word in enumerate(raw_words)]
        for offset in range(0, len(words), words_per_caption):
            chunk = words[offset:offset + words_per_caption]
            text = " ".join(str(word.get("word", "")).strip() for word in chunk).strip()
            if not text:
                continue
            text = text.upper() if uppercase else text
            text = text.replace("{", "(").replace("}", ")").replace("\n", " ")
            start_at = max(float(chunk[0].get("start", seg_start)), clip_start) - clip_start
            end_at = min(float(chunk[-1].get("end", seg_end)), clip_end) - clip_start
            if end_at > start_at:
                effect = rf"{{\an5\pos({caption_x},{caption_y})}}"
                if animation == "pop":
                    effect += r"{\fad(60,90)\fscx88\fscy88\t(0,130,\fscx100\fscy100)}"
                elif animation == "slide":
                    effect = rf"{{\an5\fad(80,100)\move({caption_x},{caption_y + 36},{caption_x},{caption_y},0,160)}}"
                elif animation == "karaoke":
                    word_duration = max(1, round((end_at - start_at) * 100 / max(len(chunk), 1)))
                    text = " ".join(rf"{{\k{word_duration}}}{str(word.get('word', '')).strip()}" for word in chunk)
                    if uppercase:
                        text = text.upper()
                events.append(f"Dialogue: 0,{_ass_time(start_at)},{_ass_time(end_at)},Caption,,0,0,0,,{effect}{text}")
    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8-sig")
