"""Global score model for SeeEnglish review sessions.

There is one shared score for the current vocabulary library. A word does not
have its own visible score; it accumulates a small contribution (0.00–0.05). Every five
encounters, the word's contribution is settled and the global score is adjusted
by the difference only:

    global_score += next_word_contribution - previous_word_contribution

That keeps settlements incremental instead of recalculating the whole database.

The calibration target is 2,000 well-known words ≈ 100 points:

    0.002 per correct recall × 5 recalls = 0.010 per perfect block
    5 perfect blocks = 0.050 max contribution per word
    2,000 × 0.050 = 100

A word can also be archived. Archiving settles its maximum contribution into
the shared score and removes it from the review pool.
"""

from __future__ import annotations

import math
import random
from typing import Any, Iterable

BLOCK_SIZE = 5
MAX_WORD_CONTRIBUTION = 0.05
POINTS_PER_CORRECT = 0.002

# The settlement is based on how many of the five encounters were recalled.
# 5/5 = five correct recalls (0.010). Errors apply a small penalty.
BLOCK_DELTAS = {
    5: 0.010,
    4: 0.006,
    3: 0.002,
    2: -0.002,
    1: -0.004,
    0: -0.006,
}

BLOCK_LABELS = {
    5: "五次都想起了",
    4: "很稳的一档",
    3: "有些地方还模糊",
    2: "这一档有些吃力",
    1: "大部分没想起来",
    0: "这一档需要重新开始",
}


def round_score(value: float) -> float:
    return round(max(0.0, float(value)), 4)


def round_word_contribution(value: float) -> float:
    return round(min(MAX_WORD_CONTRIBUTION, max(0.0, float(value))), 4)


def score_progress(score: float) -> float:
    """Compressed position on the no-ceiling score horizon.

    0–100 is the main range; 100 is CET-4. Beyond 100 the line compresses so
    the UI never suggests a hard maximum.
    """
    score = max(0.0, float(score))
    if score <= 100:
        return round(score / 100.0 * 0.72, 4)
    if score <= 200:
        return round(0.72 + (score - 100.0) / 100.0 * 0.18, 4)
    return round(0.90 + 0.10 * (1.0 - math.exp(-(score - 200.0) / 180.0)), 4)


def level_for_score(score: float) -> str:
    score = max(0.0, float(score))
    if score < 10:
        return "刚刚开始"
    if score < 30:
        return "开始积累"
    if score < 55:
        return "有了轮廓"
    if score < 80:
        return "接近四级"
    if score < 100:
        return "四级在望"
    if score < 150:
        return "CET-4 左右"
    if score < 250:
        return "超过四级"
    return "长期积累"


def contribution_for_correct(block_correct: int) -> float:
    """The contribution delta for a completed five-encounter block."""
    correct = min(BLOCK_SIZE, max(0, int(block_correct)))
    return BLOCK_DELTAS[correct]


def apply_review(
    *,
    contribution: float,
    review_count: int,
    correct_count: int,
    block_correct: int,
    block_reviews: int,
    result: str,
    global_score: float,
) -> dict[str, Any]:
    """Record one self-judged encounter and settle if the fifth one just ended."""
    if result not in {"correct", "incorrect"}:
        raise ValueError("result must be 'correct' or 'incorrect'")

    old_contribution = round_word_contribution(contribution)
    old_global = round_score(global_score)
    old_count = max(0, int(review_count))
    old_correct_count = max(0, int(correct_count))
    old_block_correct = max(0, int(block_correct))
    old_block_reviews = max(0, int(block_reviews))
    is_correct = result == "correct"

    next_count = old_count + 1
    next_correct_count = old_correct_count + (1 if is_correct else 0)
    next_block_correct = old_block_correct + (1 if is_correct else 0)
    next_block_reviews = old_block_reviews + 1

    next_contribution = old_contribution
    global_delta = 0.0
    block_settlement: dict[str, Any] | None = None
    block_accuracy: float | None = None

    if next_block_reviews >= BLOCK_SIZE:
        block_accuracy = round(next_block_correct / BLOCK_SIZE, 4)
        contribution_delta = contribution_for_correct(next_block_correct)
        next_contribution = round_word_contribution(old_contribution + contribution_delta)
        global_delta = round(next_contribution - old_contribution, 4)
        next_global = round_score(old_global + global_delta)
        block_settlement = {
            "block_number": (next_count + BLOCK_SIZE - 1) // BLOCK_SIZE,
            "accuracy": block_accuracy,
            "correct": next_block_correct,
            "total": BLOCK_SIZE,
            "word_delta": round(next_contribution - old_contribution, 4),
            "score_delta": global_delta,
            "score_after": next_global,
            "label": BLOCK_LABELS[next_block_correct],
        }
        next_block_correct = 0
        next_block_reviews = 0
    else:
        next_global = old_global

    return {
        "result": result,
        "score_before": old_global,
        "score_after": next_global,
        "delta": round(next_global - old_global, 4),
        "block_settlement": block_settlement,
        "word_contribution_before": old_contribution,
        "word_contribution_after": next_contribution,
        "state": {
            "contribution": next_contribution,
            "review_count": next_count,
            "correct_count": next_correct_count,
            "block_correct": next_block_correct,
            "block_reviews": next_block_reviews,
            "last_block_accuracy": block_accuracy,
            "last_block_delta": global_delta if block_settlement else None,
            "last_result": result,
        },
    }


def archive_contribution(contribution: float, global_score: float) -> dict[str, Any]:
    """Settle a word's maximum contribution into the shared score."""
    old_contribution = round_word_contribution(contribution)
    old_global = round_score(global_score)
    next_contribution = MAX_WORD_CONTRIBUTION
    delta = round(next_contribution - old_contribution, 4)
    next_global = round_score(old_global + delta)
    return {
        "word_delta": delta,
        "score_delta": delta,
        "score_before": old_global,
        "score_after": next_global,
        "contribution_after": next_contribution,
    }


def selection_weight(entry: dict[str, Any]) -> float:
    """Words with high contribution become rarer; missed/new words come back."""
    if entry.get("archived"):
        return 0.0

    contribution = max(0.0, min(MAX_WORD_CONTRIBUTION, float(entry.get("contribution") or 0)))
    progress = contribution / MAX_WORD_CONTRIBUTION
    factor = 0.12 + 0.88 * (1.0 - progress) ** 2

    last_accuracy = entry.get("last_block_accuracy")
    if last_accuracy is None:
        factor *= 1.10
    else:
        factor *= 1.0 + 0.80 * (1.0 - float(last_accuracy))

    if int(entry.get("review_count") or 0) == 0:
        factor *= 1.25
    if entry.get("last_result") == "incorrect":
        factor *= 1.10

    return max(0.001, round(factor, 4))


def pick_review_word(
    entries: Iterable[dict[str, Any]], exclude_id: int | None = None
) -> dict[str, Any] | None:
    """Pick a weighted random word, excluding archived words and immediate repeats."""
    pool = [entry for entry in entries if not entry.get("archived")]
    if not pool:
        return None

    if exclude_id is not None:
        without_last = [entry for entry in pool if entry["id"] != exclude_id]
        if without_last:
            pool = without_last

    weights = [selection_weight(entry) for entry in pool]
    return random.choices(pool, weights=weights, k=1)[0]
