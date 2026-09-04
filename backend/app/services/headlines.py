from __future__ import annotations

import re
from collections import Counter


STOPWORDS = {
    "aber", "alle", "als", "also", "am", "an", "auf", "aus", "bei", "bin", "bis", "da", "das", "dass",
    "dein", "deine", "dem", "den", "der", "des", "die", "dies", "doch", "du", "ein", "eine", "einen",
    "einer", "er", "es", "für", "hat", "haben", "ich", "im", "in", "ist", "ja", "kann", "man", "mit",
    "nach", "nicht", "noch", "nur", "oder", "sich", "sie", "sind", "so", "und", "vom", "von", "war",
    "was", "wenn", "wie", "wir", "wird", "wo", "zu", "zum", "zur", "sehr", "auch", "einfach", "ganz",
    "immer", "mal", "schon", "etwas", "wirklich", "persönlich", "the", "a", "and", "is", "it",
    "of", "on", "that", "this", "to", "we", "you",
}
WEAK_STARTS = {"also", "aber", "und", "oder", "ja", "äh", "ähm", "okay", "ok", "dann"}
POWER_WORDS = {
    "fehler", "geheimnis", "geld", "schnell", "warum", "wie", "wichtig", "krass", "problem", "wirklich",
    "zahlen", "teuer", "wahrheit", "abkassiert", "lüge", "mistake", "money", "secret", "why", "how",
}


def _words(value: str) -> list[str]:
    return re.findall(r"[\w€%+-]+(?:[.'’]\d+)*", value, flags=re.UNICODE)


def _shorten(value: str, limit: int = 9) -> str:
    words = _words(value)
    while words and words[0].lower() in WEAK_STARTS:
        words.pop(0)
    return " ".join(words[:limit]).strip()


def _topic_words(text: str) -> list[str]:
    tokens = [word.lower() for word in _words(text)]
    meaningful = [word for word in tokens if len(word) > 2 and word not in STOPWORDS]
    counts = Counter(meaningful)
    first_position = {word: meaningful.index(word) for word in counts}
    return sorted(counts, key=lambda word: (-counts[word], first_position[word]))[:3]


def generate_social_headline(text: str, platform: str = "shorts") -> str:
    """Create a short, grounded hook from the spoken content for one platform."""
    clean = " ".join(text.split())
    if not clean:
        return "DAS MUSST DU GESEHEN HABEN"
    lowered = clean.lower()
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", clean) if part.strip()]
    topics = _topic_words(clean)
    candidates: list[str] = []
    preferred: set[str] = set()

    for sentence in sentences[:8]:
        question = None
        if sentence.rstrip().endswith("?"):
            question_match = re.search(
                r"\b(warum|wie|was|wer|wo|wann|kannst|kann|geht|ist|sind|hat|hast)\b.*",
                sentence,
                flags=re.IGNORECASE,
            )
            question = question_match.group(0) if question_match else sentence
        shortened = _shorten(question or sentence)
        if shortened:
            candidates.append(shortened + ("?" if sentence.rstrip().endswith("?") else ""))

    if "wenig zeit" in lowered and "wirklich" in lowered:
        time_hook = "WENIG ZEIT: GEHT DAS WIRKLICH?"
        candidates.append(time_hook)
        preferred.add(time_hook)

    money_terms = {"geld", "verdienen", "umsatz", "euro", "€", "profit", "money"}
    if money_terms.intersection(set(_words(lowered))):
        money_hooks = {
            "tiktok": "SO VERDIENST DU SCHNELLER GELD",
            "instagram": "SCHNELLER GELD VERDIENEN: DAS ZÄHLT",
            "shorts": "WIE SCHNELL KANN MAN GELD VERDIENEN?",
            "youtube": "SCHNELLER GELD VERDIENEN: WAS WIRKLICH ZÄHLT",
        }
        money_hook = money_hooks.get(platform, money_hooks["shorts"])
        candidates.append(money_hook)
        preferred.add(money_hook)

    number_match = re.search(r"(\d[\d.'’]*)\s*(franken|euro|€)", lowered)
    if number_match:
        amount, currency = number_match.groups()
        subject = "PACKAGE" if "package" in lowered else "ANGEBOT" if "angebot" in lowered else "PRODUKT"
        number_hook = f"{amount} {currency.upper()} FÜR EIN {subject}?"
        candidates.append(number_hook)
        preferred.add(number_hook)

    if any(term in lowered for term in ("abkassiert", "abzock", "lüge", "leug")):
        entity_match = re.search(r"\b(?:\d+[A-Z]{1,4}|[A-Z]{2,}\d*)\b", clean)
        entity = entity_match.group(0) if entity_match else (topics[0].upper() if topics else "DAS")
        warning_hook = f"SO KASSIERT {entity} RICHTIG AB"
        candidates.append(warning_hook)
        preferred.add(warning_hook)

    def score(candidate: str) -> float:
        words = _words(candidate)
        lowered_candidate = candidate.lower()
        value = 20.0
        value += max(0, 14 - abs(len(words) - (6 if platform != "youtube" else 8)) * 2)
        value += sum(4 for word in POWER_WORDS if word in lowered_candidate)
        value += sum(3 for topic in topics if topic in lowered_candidate)
        value += 20 if "?" in candidate and platform in {"tiktok", "shorts"} else 0
        # Concrete amounts are substantially stronger and more faithful than a
        # generic money hook when the clip actually names a number.
        value += 20 if re.search(r"\d|€|%", candidate) else 0
        value += 25 if candidate in preferred else 0
        value -= 12 if words and words[0].lower() in WEAK_STARTS else 0
        value -= max(0, len(words) - 9) * 8
        return value

    best = max(candidates, key=score, default=_shorten(clean))
    final_words = _words(best)[:9]
    return " ".join(final_words).upper() + ("?" if best.rstrip().endswith("?") else "")


def generate_dual_headlines(text: str, platform: str = "shorts") -> tuple[str, str]:
    """Return one grounded topic hook and one complementary reaction hook."""
    main = generate_social_headline(text, platform)
    lowered = text.lower()
    topics = _topic_words(text)
    if any(term in lowered for term in ("abzock", "betrug", "lüge", "abkass", "problem")):
        reaction = "DARUM IST DAS EIN RIESIGES PROBLEM"
    elif any(term in lowered for term in ("fehler", "falsch", "scheit", "risiko")):
        reaction = "DIESER FEHLER ÄNDERT ALLES"
    elif any(term in lowered for term in ("geld", "euro", "€", "umsatz", "verdienen", "preis")):
        reaction = "DAS KANN DOCH NICHT WAHR SEIN"
    elif topics:
        topic = " ".join(topics[:2]).upper()
        reaction = f"WAS {topic} WIRKLICH BEDEUTET"
    else:
        reaction = "DARÜBER SPRICHT FAST NIEMAND"
    if reaction == main:
        reaction = "DAS IST DIE EHRLICHE REAKTION"
    return main[:120], reaction[:120]
