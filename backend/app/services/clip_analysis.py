from __future__ import annotations

import json
import re
from pathlib import Path

from sqlalchemy import delete, select

from backend.app.core.database import SessionLocal
from backend.app.core.config import settings
from backend.app.models import Clip, Project, Transcript
from backend.app.services.rendering import ProgressCallback
from backend.app.services.video import MediaInspectionError, _audio_envelope, reaction_activity_score
from backend.app.services.headlines import generate_social_headline


HOOK_TERMS = {"warum", "wie", "wichtig", "problem", "fehler", "unglaublich", "krass", "deshalb", "because", "why", "how", "secret", "mistake", "never", "niemals", "niemand", "wirklich", "truth", "actually"}
WEAK_OPENERS = {"und", "oder", "also", "aber", "denn", "dann", "genau", "ja", "äh", "ähm", "hm", "then", "and", "but", "um"}
PAYOFF_TERMS = {"deshalb", "dadurch", "also", "resultat", "ergebnis", "lösung", "fazit", "therefore", "result", "solution", "finally"}
EMOTION_TERMS = {"liebe", "hasse", "verrückt", "heftig", "schock", "lustig", "peinlich", "wahnsinn", "love", "hate", "crazy", "amazing", "shocking", "funny"}
CONFLICT_TERMS = {"aber", "trotzdem", "gegen", "streit", "falsch", "risiko", "scheitern", "however", "versus", "wrong", "risk", "fail"}


def _tokens(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-zäöüß]{4,}", text.lower()) if token not in WEAK_OPENERS}


def _similarity(left: str, right: str) -> float:
    left_tokens, right_tokens = _tokens(left), _tokens(right)
    union = left_tokens | right_tokens
    return len(left_tokens & right_tokens) / len(union) if union else 0.0


def analyze_best_clips(project_id: str, progress: ProgressCallback, platform: str = "shorts") -> dict[str, str | None]:
    with SessionLocal() as session:
        project = session.get(Project, project_id)
        transcript = session.scalar(select(Transcript).where(Transcript.project_id == project_id))
        if not transcript:
            raise MediaInspectionError("Create a transcript before starting Smart Cut")
        segments = json.loads(transcript.segments_json)

    if not segments:
        raise MediaInspectionError("The transcript has no spoken segments")
    target_duration = 38.0
    profile_path = (settings.storage_path / "references" / f"{project_id}.json").resolve()
    if profile_path.is_file():
        try:
            target_duration = min(max(float(json.loads(profile_path.read_text(encoding="utf-8")).get("target_clip_duration", 38)), 15), 90)
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            target_duration = 38.0
    minimum_duration = max(10.0, target_duration * 0.65)
    maximum_duration = min(120.0, target_duration * 1.35)
    content_start = min(float(item["start"]) for item in segments)
    content_end = max(float(item["end"]) for item in segments)
    content_duration = max(content_end - content_start, 1.0)
    reaction_envelope = None
    reaction_offset = 0.0
    reaction_profile = (settings.storage_path / "reactions" / f"{project_id}.json").resolve()
    if project and reaction_profile.is_file():
        try:
            reaction_data = json.loads(reaction_profile.read_text(encoding="utf-8"))
            reaction_path = Path(str(reaction_data.get("path", ""))).resolve()
            if reaction_path.is_file():
                reaction_offset = float(reaction_data.get("offset_seconds", 0.0))
                reaction_envelope = _audio_envelope(reaction_path)
        except (OSError, ValueError, TypeError, json.JSONDecodeError, MediaInspectionError):
            reaction_envelope = None
    # One-hour uploads yield ten strong options. The target grows gradually to
    # fifteen for an eight-hour stream so the gallery stays focused on only the
    # strongest moments.
    target_count = min(15, max(10, round(10 + max(content_duration - 3600, 0) / (7 * 3600) * 5)))
    progress(8, f"Bewerte Hooks, Spannung und Payoff für {target_count} starke Clips")
    candidates: list[dict[str, object]] = []
    for index, first in enumerate(segments):
        text_parts: list[str] = []
        spoken = 0.0
        for last in segments[index:]:
            end = float(last["end"])
            duration = end - float(first["start"])
            if duration > maximum_duration:
                break
            if text_parts and float(last["start"]) - float(segments[index + len(text_parts) - 1]["end"]) > 4.5:
                break
            text = str(last["text"]).strip()
            text_parts.append(text)
            spoken += max(0, float(last["end"]) - float(last["start"]))
            if duration < minimum_duration:
                continue
            joined = " ".join(text_parts)
            lowered = joined.lower()
            words = lowered.split()
            opening = " ".join(text_parts[:min(2, len(text_parts))]).lower()
            closing = " ".join(text_parts[-min(3, len(text_parts)):]).lower()
            hook_hits = sum(1 for term in HOOK_TERMS if re.search(rf"\b{re.escape(term)}\b", lowered))
            punctuation = joined.count("?") * 2 + joined.count("!")
            density = min(len(words) / max(duration, 1), 3.2)
            speech_ratio = min(spoken / max(duration, 1), 1)
            length_quality = max(0, 1 - abs(duration - target_duration) / max(target_duration, 1))
            first_word = re.sub(r"[^\wäöüß]", "", words[0]) if words else ""
            clean_opening = -10 if first_word in WEAK_OPENERS else 6
            complete_ending = 7 if joined.rstrip().endswith((".", "!", "?")) else -5
            narrative_payoff = 7 if any(term in closing for term in PAYOFF_TERMS) else 0
            emotional_charge = min(sum(1 for term in EMOTION_TERMS if term in lowered) * 2.5, 7.5)
            conflict = min(sum(1 for term in CONFLICT_TERMS if term in lowered) * 2, 6)
            concrete_detail = 5 if re.search(r"\b(?:\d+[.,]?\d*|prozent|euro|franken|stunden?|tage?|percent|hours?|days?)\b", lowered) else 0
            direct_address = 4 if re.search(r"\b(?:du|dein|ihr|euer|you|your)\b", lowered) else 0
            early_hook = 8 if any(re.search(rf"\b{re.escape(term)}\b", opening) for term in HOOK_TERMS) else 0
            opening_question = 7 if "?" in opening else 0
            closing_answer = 5 if any(term in closing for term in PAYOFF_TERMS | {"fehler", "falsch", "wahr", "klar", "definitiv"}) else 0
            reaction_score = 0.0
            if reaction_envelope is not None:
                reaction_score = reaction_activity_score(
                    reaction_envelope,
                    float(first["start"]) + reaction_offset,
                    end + reaction_offset,
                )
            previous_gap = float(first["start"]) - float(segments[index - 1]["end"]) if index else 10.0
            boundary_bonus = 5 if previous_gap >= 1.0 else 0
            unique_lines = len({part.casefold() for part in text_parts})
            repetition_penalty = max(0, len(text_parts) - unique_lines) * 5
            filler_penalty = min(sum(words.count(term) for term in WEAK_OPENERS) * 1.2, 10)
            score = round(
                18
                + density * 7
                + speech_ratio * 12
                + length_quality * 9
                + min(hook_hits * 3 + punctuation * 2, 12)
                + clean_opening
                + complete_ending
                + narrative_payoff
                + emotional_charge
                + conflict
                + concrete_detail
                + direct_address
                + early_hook
                + opening_question
                + closing_answer
                + boundary_bonus
                + reaction_score * 18
                - filler_penalty
                - repetition_penalty
            )
            candidates.append({
                "start": max(0.0, float(first["start"]) - 0.35),
                "end": end + 0.25,
                "text": joined,
                "score": max(1, min(score, 99)),
                "reaction_score": reaction_score,
            })
    if not candidates:
        raise MediaInspectionError("Not enough continuous speech was found for a short clip")

    candidates.sort(key=lambda item: int(item["score"]), reverse=True)
    selected: list[dict[str, object]] = []
    pool = candidates[: max(250, target_count * 30)]
    while pool and len(selected) < target_count:
        ranked: list[tuple[float, dict[str, object]]] = []
        for candidate in pool:
            overlaps = any(
                float(candidate["start"]) < float(other["end"]) + 4
                and float(candidate["end"]) > float(other["start"]) - 4
                for other in selected
            )
            if overlaps:
                continue
            similarity = max(
                (_similarity(str(candidate["text"]), str(other["text"])) for other in selected),
                default=0.0,
            )
            if similarity > 0.72:
                continue
            midpoint = (float(candidate["start"]) + float(candidate["end"])) / 2
            nearest = min(
                (abs(midpoint - (float(other["start"]) + float(other["end"])) / 2) for other in selected),
                default=content_duration,
            )
            coverage_bonus = min(nearest / max(content_duration, 1) * target_count * 1.5, 5)
            ranked.append((float(candidate["score"]) + coverage_bonus - similarity * 14, candidate))
        if not ranked:
            break
        choice = max(ranked, key=lambda item: item[0])[1]
        selected.append(choice)
        pool.remove(choice)
    # Quality decides which clips make the cut; the editor and export gallery
    # then follow the actual conversation from beginning to end.
    selected.sort(key=lambda item: float(item["start"]))
    progress(70, f"Erstelle {len(selected)} eigenständige Highlights")
    with SessionLocal() as session:
        session.execute(delete(Clip).where(Clip.project_id == project_id))
        for number, item in enumerate(selected, 1):
            text = str(item["text"])
            title = generate_social_headline(text, platform) or f"Smart Cut {number}"
            session.add(Clip(
                project_id=project_id,
                start=round(float(item["start"]), 3),
                end=round(float(item["end"]), 3),
                title=title[:255],
                hook=text[:320],
                score=int(item["score"]),
                reason=(
                    f"Vollständiger Gesprächsbogen mit verständlichem Einstieg, Aufbau und Payoff; "
                    f"für {platform} auf etwa {round(target_duration)} Sekunden verdichtet. "
                    + ("Reaction-Sprache und sichtbare Antwort im selben Zeitfenster priorisiert." if float(item.get("reaction_score", 0)) >= 0.35 else "")
                ),
            ))
        session.commit()
    progress(99, "Smart cuts are ready")
    return {}
