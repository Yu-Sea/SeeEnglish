"""Match an input form against saved vocabulary without a dictionary service."""

from __future__ import annotations

from typing import Any

from .morphology import lemma_candidates, normalize, relation_label


def find_matches(
    entries: list[dict[str, Any]], query: str, *, limit: int = 8
) -> list[dict[str, Any]]:
    normalized_query = normalize(query)
    if not normalized_query:
        return []

    query_lemmas = lemma_candidates(normalized_query)
    scored: list[tuple[int, int, dict[str, Any]]] = []

    for order, entry in enumerate(entries):
        headword = normalize(entry["word"])
        forms = [normalize(form) for form in entry.get("forms", []) if form]
        match_type: str | None = None
        score = 0
        label = "相关形态"
        matched_form = entry["word"]

        if normalized_query == headword:
            match_type, score, label = "exact", 100, "完全匹配"
        elif normalized_query in forms:
            match_type = "stored"
            score = 96
            label = "已记录形态"
            matched_form = entry["forms"][forms.index(normalized_query)]
        elif headword in query_lemmas:
            match_type = "derived"
            score = 88
            label = relation_label(normalized_query, headword)
            matched_form = normalized_query
        elif any(form in query_lemmas for form in forms):
            match_type = "derived"
            score = 84
            label = relation_label(normalized_query, headword)
            matched_form = normalized_query
        elif any(normalized_query in lemma_candidates(form) for form in forms):
            match_type = "related"
            score = 74
            label = "词库中已有变体"
            matched_form = normalized_query
        elif normalized_query in lemma_candidates(headword):
            match_type = "related"
            score = 72
            label = "词库中已有变体"
            matched_form = normalized_query
        elif headword.startswith(normalized_query):
            match_type = "prefix"
            score = 68
            label = "前缀匹配"
        elif any(form.startswith(normalized_query) for form in forms):
            match_type = "prefix"
            score = 64
            label = "形态前缀"
            matched_form = entry["forms"][
                next(index for index, form in enumerate(forms) if form.startswith(normalized_query))
            ]
        elif normalized_query in headword:
            match_type = "contains"
            score = 58
            label = "包含匹配"
        elif any(normalized_query in form for form in forms):
            match_type = "contains"
            score = 54
            label = "形态包含"
            matched_form = entry["forms"][
                next(index for index, form in enumerate(forms) if normalized_query in form)
            ]
        else:
            continue

        match = dict(entry)
        match["match_type"] = match_type
        match["relation_label"] = label
        match["matched_form"] = matched_form
        scored.append((score, order, match))

    # Exact and morphological matches first. Prefix matches beat words that
    # merely contain the query. Equal-ranked words keep the library order.
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [item[2] for item in scored[:limit]]
