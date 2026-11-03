"""SQLite persistence for SeeEnglish."""

from __future__ import annotations

import json
import math
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

from .morphology import WORD_RE, normalize
from .scoring import (
    BLOCK_SIZE,
    MAX_WORD_CONTRIBUTION,
    apply_review,
    archive_contribution,
    level_for_score,
    round_score,
    round_word_contribution,
    score_progress,
)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = ROOT / "data" / "seeenglish.db"
DEFAULT_LIBRARY_ID = 1
DEFAULT_LIBRARY_NAME = "默认词库"
DEFAULT_LIBRARY_GROUP = "未分组"

REVIEW_COLUMNS: dict[str, str] = {
    "contribution": "REAL NOT NULL DEFAULT 0",
    "review_count": "INTEGER NOT NULL DEFAULT 0",
    "correct_count": "INTEGER NOT NULL DEFAULT 0",
    "block_correct": "INTEGER NOT NULL DEFAULT 0",
    "block_reviews": "INTEGER NOT NULL DEFAULT 0",
    "last_block_accuracy": "REAL",
    "last_block_delta": "REAL",
    "last_reviewed_at": "TEXT",
    "last_result": "TEXT",
    "archived": "INTEGER NOT NULL DEFAULT 0",
    "archived_at": "TEXT",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if str(item).strip()]


def _import_strings(
    value: Any, limit: int, max_length: int, *, words_only: bool = False
) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in value:
        if not isinstance(raw, str):
            continue
        text = raw.strip()[:max_length]
        if not text:
            continue
        if words_only:
            normalized = normalize(text)
            if not normalized or not WORD_RE.fullmatch(normalized):
                continue
        key = text.lower()
        if key in seen:
            continue
        cleaned.append(text)
        seen.add(key)
        if len(cleaned) >= limit:
            break
    return cleaned


def _import_int(value: Any, *, minimum: int, maximum: int) -> int:
    try:
        number = int(float(value))
    except (TypeError, ValueError, OverflowError):
        return minimum
    return max(minimum, min(maximum, number))


def _import_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _import_timestamp(value: Any, fallback: str) -> str:
    if isinstance(value, str) and 0 < len(value.strip()) <= 40:
        return value.strip()
    return fallback


def _json_ids(value: str | None) -> list[int]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    ids: list[int] = []
    for item in parsed:
        try:
            number = int(item)
        except (TypeError, ValueError):
            continue
        if number > 0 and number not in ids:
            ids.append(number)
    return ids


class Database:
    def __init__(self, path: str | os.PathLike[str] | None = None) -> None:
        self.path = Path(path or os.environ.get("SEEENGLISH_DB") or DEFAULT_DB_PATH)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.init()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def init(self) -> None:
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS libraries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    group_name TEXT NOT NULL DEFAULT '未分组',
                    is_default INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            now = utc_now()
            connection.execute(
                """
                INSERT OR IGNORE INTO libraries
                    (id, name, group_name, is_default, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?)
                """,
                (DEFAULT_LIBRARY_ID, DEFAULT_LIBRARY_NAME, DEFAULT_LIBRARY_GROUP, now, now),
            )
            connection.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_libraries_name ON libraries(name COLLATE NOCASE)"
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS library_scores (
                    library_id INTEGER PRIMARY KEY,
                    total_score REAL NOT NULL DEFAULT 0,
                    updated_at TEXT,
                    FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
                )
                """
            )
            if self._table_exists(connection, "score_state"):
                score_row = connection.execute(
                    "SELECT total_score, updated_at FROM score_state WHERE id = 1"
                ).fetchone()
                if score_row is not None:
                    connection.execute(
                        """
                        INSERT OR IGNORE INTO library_scores (library_id, total_score, updated_at)
                        VALUES (?, ?, ?)
                        """,
                        (
                            DEFAULT_LIBRARY_ID,
                            score_row["total_score"],
                            score_row["updated_at"],
                        ),
                    )
            connection.execute(
                "INSERT OR IGNORE INTO library_scores (library_id, total_score) VALUES (?, 0)",
                (DEFAULT_LIBRARY_ID,),
            )

            words_exists = self._table_exists(connection, "words")
            if not words_exists:
                self._create_words_table(connection, "words")
            words_columns = self._column_names(connection, "words")
            needs_rebuild = words_exists and "library_id" not in words_columns

            if not needs_rebuild:
                for column, definition in REVIEW_COLUMNS.items():
                    if column not in words_columns:
                        connection.execute(
                            f"ALTER TABLE words ADD COLUMN {column} {definition}"
                        )
                if "contribution" not in words_columns:
                    connection.execute(
                        "UPDATE words SET contribution = 0, block_correct = 0, block_reviews = 0, archived = 0, archived_at = NULL"
                    )

            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    word_id INTEGER NOT NULL,
                    result TEXT NOT NULL,
                    answer TEXT NOT NULL DEFAULT '',
                    score_before REAL NOT NULL,
                    score_after REAL NOT NULL,
                    weight REAL NOT NULL,
                    block_index INTEGER NOT NULL,
                    block_accuracy REAL,
                    block_delta REAL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
                )
                """
            )
            settlements_exists = self._table_exists(connection, "score_settlements")
            if not settlements_exists:
                connection.execute(
                    """
                    CREATE TABLE score_settlements (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        library_id INTEGER NOT NULL DEFAULT 1,
                        word_id INTEGER NOT NULL,
                        word TEXT NOT NULL,
                        kind TEXT NOT NULL,
                        correct INTEGER,
                        total INTEGER,
                        delta REAL NOT NULL,
                        contribution_after REAL NOT NULL,
                        score_after REAL NOT NULL,
                        created_at TEXT NOT NULL,
                        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
                        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
                    )
                    """
                )
            elif "library_id" not in self._column_names(connection, "score_settlements"):
                connection.execute(
                    "ALTER TABLE score_settlements ADD COLUMN library_id INTEGER NOT NULL DEFAULT 1"
                )

            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_words_updated ON words(updated_at DESC)"
            )
            if not needs_rebuild:
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_words_library ON words(library_id, updated_at DESC)"
                )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_reviews_word ON reviews(word_id, created_at DESC)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_settlements_created ON score_settlements(created_at DESC, id DESC)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_settlements_library ON score_settlements(library_id, created_at DESC, id DESC)"
            )

        if needs_rebuild:
            self._rebuild_words_for_libraries()
            with self.connect() as connection:
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_words_library ON words(library_id, updated_at DESC)"
                )

    @staticmethod
    def _table_exists(connection: sqlite3.Connection, name: str) -> bool:
        row = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (name,),
        ).fetchone()
        return row is not None

    @staticmethod
    def _column_names(connection: sqlite3.Connection, table: str) -> set[str]:
        return {row[1] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}

    @staticmethod
    def _create_words_table(connection: sqlite3.Connection, name: str) -> None:
        connection.execute(
            f"""
            CREATE TABLE {name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                library_id INTEGER NOT NULL DEFAULT 1,
                word TEXT NOT NULL,
                normalized TEXT NOT NULL,
                forms TEXT NOT NULL DEFAULT '[]',
                sentences TEXT NOT NULL DEFAULT '[]',
                note TEXT NOT NULL DEFAULT '',
                related_ids TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                contribution REAL NOT NULL DEFAULT 0,
                review_count INTEGER NOT NULL DEFAULT 0,
                correct_count INTEGER NOT NULL DEFAULT 0,
                block_correct INTEGER NOT NULL DEFAULT 0,
                block_reviews INTEGER NOT NULL DEFAULT 0,
                last_block_accuracy REAL,
                last_block_delta REAL,
                last_reviewed_at TEXT,
                last_result TEXT,
                archived INTEGER NOT NULL DEFAULT 0,
                archived_at TEXT,
                FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
                UNIQUE (library_id, normalized)
            )
            """
        )

    def _rebuild_words_for_libraries(self) -> None:
        """Move the pre-library words table onto (library_id, normalized).

        SQLite cannot drop a UNIQUE constraint in place, so the table is rebuilt
        with its ids and review columns intact. Foreign keys are disabled only
        for this copy so reviews and score settlements keep their word ids.
        """
        connection = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        connection.row_factory = sqlite3.Row
        now = utc_now()
        try:
            connection.execute("PRAGMA foreign_keys = OFF")
            connection.execute("BEGIN IMMEDIATE")
            columns = self._column_names(connection, "words")
            words = self._table_exists(connection, "words")

            def value(name: str, fallback: str) -> str:
                if name not in columns:
                    return fallback
                return f"COALESCE({name}, {fallback})"

            connection.execute("DROP TABLE IF EXISTS words_new")
            self._create_words_table(connection, "words_new")
            if words:
                connection.execute(
                    f"""
                    INSERT INTO words_new (
                        id, library_id, word, normalized, forms, sentences, note,
                        related_ids, created_at, updated_at, contribution,
                        review_count, correct_count, block_correct, block_reviews,
                        last_block_accuracy, last_block_delta, last_reviewed_at,
                        last_result, archived, archived_at
                    )
                    SELECT
                        id, {DEFAULT_LIBRARY_ID}, word, normalized,
                        {value("forms", "'[]'")},
                        {value("sentences", "'[]'")},
                        {value("note", "''")},
                        {value("related_ids", "'[]'")},
                        {value("created_at", f"'{now}'")},
                        {value("updated_at", f"'{now}'")},
                        {value("contribution", "0")},
                        {value("review_count", "0")},
                        {value("correct_count", "0")},
                        {value("block_correct", "0")},
                        {value("block_reviews", "0")},
                        {value("last_block_accuracy", "NULL")},
                        {value("last_block_delta", "NULL")},
                        {value("last_reviewed_at", "NULL")},
                        {value("last_result", "NULL")},
                        {value("archived", "0")},
                        {value("archived_at", "NULL")}
                    FROM words
                    """
                )
                connection.execute("DROP TABLE words")
            connection.execute("ALTER TABLE words_new RENAME TO words")
            max_row = connection.execute("SELECT COALESCE(MAX(id), 0) AS max_id FROM words").fetchone()
            max_id = int(max_row["max_id"] if max_row else 0)
            connection.execute(
                "INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('words', ?)",
                (max_id,),
            )
            connection.execute("COMMIT")
        except Exception:
            connection.execute("ROLLBACK")
            raise
        finally:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.close()

    def get_library(self, library_id: int) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM libraries WHERE id = ?", (library_id,)
            ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["is_default"] = bool(result["is_default"])
        return result

    def libraries(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            library_rows = list(
                connection.execute(
                    "SELECT * FROM libraries ORDER BY is_default DESC, id ASC"
                ).fetchall()
            )
            word_rows = list(
                connection.execute(
                    "SELECT library_id, sentences, archived FROM words"
                ).fetchall()
            )
            score_rows = list(
                connection.execute(
                    "SELECT library_id, total_score FROM library_scores"
                ).fetchall()
            )

        stats: dict[int, dict[str, int]] = {}
        for row in word_rows:
            library_id = int(row["library_id"])
            item = stats.setdefault(
                library_id,
                {"word_count": 0, "sentence_count": 0, "archived_count": 0},
            )
            item["word_count"] += 1
            item["sentence_count"] += len(_json_list(row["sentences"]))
            if bool(row["archived"]):
                item["archived_count"] += 1
        scores = {int(row["library_id"]): float(row["total_score"] or 0) for row in score_rows}

        result: list[dict[str, Any]] = []
        for row in library_rows:
            library_id = int(row["id"])
            item = stats.get(
                library_id,
                {"word_count": 0, "sentence_count": 0, "archived_count": 0},
            )
            result.append(
                {
                    "id": library_id,
                    "name": row["name"],
                    "group_name": row["group_name"],
                    "is_default": bool(row["is_default"]),
                    "word_count": item["word_count"],
                    "sentence_count": item["sentence_count"],
                    "archived_count": item["archived_count"],
                    "score": round_score(scores.get(library_id, 0)),
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                }
            )
        return result

    def create_library(self, *, name: str, group_name: str = DEFAULT_LIBRARY_GROUP) -> dict[str, Any]:
        now = utc_now()
        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO libraries (name, group_name, is_default, created_at, updated_at)
                    VALUES (?, ?, 0, ?, ?)
                    """,
                    (name, group_name, now, now),
                )
                library_id = int(cursor.lastrowid or 0)
                connection.execute(
                    "INSERT INTO library_scores (library_id, total_score, updated_at) VALUES (?, 0, ?)",
                    (library_id, now),
                )
        except sqlite3.IntegrityError as error:
            raise ValueError("已经有一个同名词库了。") from error
        library = self.get_library(library_id)
        if library is None:
            raise RuntimeError("Library was inserted but could not be read back")
        return library

    def update_library(
        self, library_id: int, *, name: str, group_name: str
    ) -> dict[str, Any] | None:
        existing = self.get_library(library_id)
        if existing is None:
            return None
        try:
            with self.connect() as connection:
                connection.execute(
                    "UPDATE libraries SET name = ?, group_name = ?, updated_at = ? WHERE id = ?",
                    (name, group_name, utc_now(), library_id),
                )
        except sqlite3.IntegrityError as error:
            raise ValueError("已经有一个同名词库了。") from error
        return self.get_library(library_id)

    def delete_library(self, library_id: int) -> bool:
        library = self.get_library(library_id)
        if library is None:
            return False
        if library["is_default"]:
            raise ValueError("默认词库不能删除。")
        with self.connect() as connection:
            connection.execute(
                "DELETE FROM score_settlements WHERE library_id = ?", (library_id,)
            )
            connection.execute("DELETE FROM library_scores WHERE library_id = ?", (library_id,))
            connection.execute("DELETE FROM libraries WHERE id = ?", (library_id,))
        return True

    def _rows(self, library_id: int = DEFAULT_LIBRARY_ID) -> list[sqlite3.Row]:
        with self.connect() as connection:
            return list(
                connection.execute(
                    "SELECT * FROM words WHERE library_id = ? ORDER BY updated_at DESC, id DESC",
                    (library_id,),
                )
            )

    def _resolve_relations(
        self, related_ids: Iterable[int], row_map: dict[int, sqlite3.Row], *, exclude: int | None = None
    ) -> list[dict[str, Any]]:
        relations: list[dict[str, Any]] = []
        for related_id in related_ids:
            if related_id == exclude:
                continue
            related = row_map.get(related_id)
            if related is None:
                continue
            relations.append({"id": related["id"], "word": related["word"]})
        return relations

    def _row_to_entry(self, row: sqlite3.Row, row_map: dict[int, sqlite3.Row]) -> dict[str, Any]:
        related_ids = _json_ids(row["related_ids"])
        review_count = int(row["review_count"] or 0)
        correct_count = int(row["correct_count"] or 0)
        block_correct = int(row["block_correct"] or 0)
        block_reviews = int(row["block_reviews"] or 0)
        contribution = round_word_contribution(row["contribution"] or 0)
        last_block_accuracy = row["last_block_accuracy"]
        last_block_delta = row["last_block_delta"]

        return {
            "id": row["id"],
            "library_id": row["library_id"],
            "word": row["word"],
            "forms": _json_list(row["forms"]),
            "sentences": _json_list(row["sentences"]),
            "note": row["note"],
            "related": self._resolve_relations(related_ids, row_map, exclude=row["id"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "contribution": contribution,
            "review_count": review_count,
            "correct_count": correct_count,
            "accuracy": round(correct_count / review_count, 4) if review_count else None,
            "block_correct": block_correct,
            "block_reviews": block_reviews,
            "block_position": block_reviews,
            "last_block_accuracy": float(last_block_accuracy) if last_block_accuracy is not None else None,
            "last_block_delta": float(last_block_delta) if last_block_delta is not None else None,
            "last_reviewed_at": row["last_reviewed_at"],
            "last_result": row["last_result"],
            "archived": bool(row["archived"]),
            "archived_at": row["archived_at"],
        }

    def _entry_from_rows(self, row: sqlite3.Row, rows: list[sqlite3.Row]) -> dict[str, Any]:
        row_map = {item["id"]: item for item in rows}
        return self._row_to_entry(row, row_map)

    def list_entries(
        self, query: str = "", limit: int = 500, library_id: int = DEFAULT_LIBRARY_ID
    ) -> list[dict[str, Any]]:
        rows = self._rows(library_id)
        needle = query.strip().lower()
        if needle:
            rows = [
                row
                for row in rows
                if needle in row["word"].lower()
                or needle in row["note"].lower()
                or needle in row["sentences"].lower()
                or any(needle in form.lower() for form in _json_list(row["forms"]))
            ]
        row_map = {item["id"]: item for item in rows}
        return [self._row_to_entry(row, row_map) for row in rows[:limit]]

    def get_entry(self, entry_id: int) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM words WHERE id = ?", (entry_id,)
            ).fetchone()
        if row is None:
            return None
        rows = self._rows(int(row["library_id"]))
        return self._entry_from_rows(row, rows)

    def get_by_word(
        self, normalized: str, library_id: int = DEFAULT_LIBRARY_ID
    ) -> dict[str, Any] | None:
        rows = self._rows(library_id)
        for row in rows:
            if row["normalized"] == normalized:
                return self._entry_from_rows(row, rows)
        return None

    def all_entries(self, library_id: int = DEFAULT_LIBRARY_ID) -> list[dict[str, Any]]:
        rows = self._rows(library_id)
        row_map = {item["id"]: item for item in rows}
        return [self._row_to_entry(row, row_map) for row in rows]

    def valid_related_ids(
        self,
        ids: Iterable[int],
        *,
        exclude: int | None = None,
        library_id: int = DEFAULT_LIBRARY_ID,
    ) -> list[int]:
        ordered = [int(item) for item in ids if int(item) > 0 and int(item) != exclude]
        if not ordered:
            return []
        wanted = set(ordered)
        with self.connect() as connection:
            placeholders = ",".join("?" for _ in wanted)
            found = connection.execute(
                f"SELECT id FROM words WHERE library_id = ? AND id IN ({placeholders})",
                (library_id, *sorted(wanted)),
            ).fetchall()
        found_ids = {row["id"] for row in found}
        return [item for item in ordered if item in found_ids]

    def create_entry(
        self,
        *,
        word: str,
        normalized: str,
        sentence: str = "",
        note: str = "",
        related_ids: Iterable[int] = (),
        library_id: int = DEFAULT_LIBRARY_ID,
    ) -> dict[str, Any]:
        now = utc_now()
        valid_relations = self.valid_related_ids(related_ids, library_id=library_id)
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO words (
                    library_id, word, normalized, forms, sentences, note, related_ids,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, '[]', ?, ?, ?, ?, ?)
                """,
                (
                    library_id,
                    word,
                    normalized,
                    json.dumps([sentence] if sentence else [], ensure_ascii=False),
                    note,
                    json.dumps(valid_relations),
                    now,
                    now,
                ),
            )
            entry_id = int(cursor.lastrowid or 0)
        entry = self.get_entry(entry_id)
        if entry is None:
            raise RuntimeError("Entry was inserted but could not be read back")
        return entry

    def supplement_entry(
        self,
        entry_id: int,
        *,
        source_form: str = "",
        sentence: str = "",
        note: str = "",
        related_ids: Iterable[int] = (),
    ) -> dict[str, Any] | None:
        current = self.get_entry(entry_id)
        if current is None:
            return None

        now = utc_now()
        forms = list(current["forms"])
        if source_form and source_form.lower() not in {form.lower() for form in forms}:
            forms.append(source_form)

        sentences = list(current["sentences"])
        if sentence and sentence.lower() not in {item.lower() for item in sentences}:
            sentences.append(sentence)

        merged_note = current["note"]
        if note:
            if not merged_note:
                merged_note = note
            elif note.lower() not in merged_note.lower():
                merged_note = f"{merged_note}\n\n{note}"

        current_related_ids = [item["id"] for item in current["related"]]
        wanted_relations = list(current_related_ids)
        wanted_relations.extend(item for item in related_ids if item not in wanted_relations)
        valid_relations = self.valid_related_ids(
            wanted_relations, exclude=entry_id, library_id=current["library_id"]
        )

        with self.connect() as connection:
            connection.execute(
                """
                UPDATE words
                SET forms = ?, sentences = ?, note = ?, related_ids = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    json.dumps(forms, ensure_ascii=False),
                    json.dumps(sentences, ensure_ascii=False),
                    merged_note,
                    json.dumps(valid_relations),
                    now,
                    entry_id,
                ),
            )
        return self.get_entry(entry_id)

    def update_entry(
        self,
        entry_id: int,
        *,
        word: str,
        normalized: str,
        note: str,
        sentences: Iterable[str],
        related_ids: Iterable[int],
    ) -> dict[str, Any] | None:
        current = self.get_entry(entry_id)
        if current is None:
            return None

        cleaned_sentences: list[str] = []
        seen_sentences: set[str] = set()
        for sentence in sentences:
            text = sentence.strip()
            if text and text.lower() not in seen_sentences:
                cleaned_sentences.append(text)
                seen_sentences.add(text.lower())

        valid_relations = self.valid_related_ids(
            related_ids, exclude=entry_id, library_id=current["library_id"]
        )
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE words
                SET word = ?, normalized = ?, note = ?, sentences = ?, related_ids = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    word,
                    normalized,
                    note,
                    json.dumps(cleaned_sentences, ensure_ascii=False),
                    json.dumps(valid_relations),
                    utc_now(),
                    entry_id,
                ),
            )
        return self.get_entry(entry_id)

    def unarchive_entry(
        self, entry_id: int
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT id, library_id FROM words WHERE id = ?", (entry_id,)
            ).fetchone()
            if row is None:
                return None, None
            connection.execute(
                "UPDATE words SET archived = 0, archived_at = NULL WHERE id = ?",
                (entry_id,),
            )
            library_id = int(row["library_id"])
        return self.get_entry(entry_id), self.overview(library_id)

    def delete_entry(
        self, entry_id: int
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        """Delete a word, remove its contribution from the shared score and keep
        prior score events for the trend by disabling the cascade for this one
        connection."""
        with self.connect() as connection:
            connection.execute("PRAGMA foreign_keys = OFF")
            row = connection.execute("SELECT * FROM words WHERE id = ?", (entry_id,)).fetchone()
            if row is None:
                return None, None
            library_id = int(row["library_id"])

            score_row = connection.execute(
                "SELECT total_score FROM library_scores WHERE library_id = ?",
                (library_id,),
            ).fetchone()
            global_score = round_score(score_row["total_score"] if score_row else 0)
            contribution = round_word_contribution(row["contribution"] or 0)
            score_after = round_score(global_score - contribution)
            now = utc_now()

            connection.execute(
                "UPDATE library_scores SET total_score = ?, updated_at = ? WHERE library_id = ?",
                (score_after, now, library_id),
            )
            connection.execute(
                """
                INSERT INTO score_settlements (
                    library_id, word_id, word, kind, correct, total, delta,
                    contribution_after, score_after, created_at
                ) VALUES (?, ?, ?, 'delete', NULL, NULL, ?, 0, ?, ?)
                """,
                (library_id, entry_id, row["word"], -contribution, score_after, now),
            )
            connection.execute("DELETE FROM reviews WHERE word_id = ?", (entry_id,))
            connection.execute("DELETE FROM words WHERE id = ?", (entry_id,))

        deleted = {
            "id": entry_id,
            "word": row["word"],
            "contribution": contribution,
            "score_after": score_after,
        }
        return deleted, self.overview(library_id)

    def record_review(
        self, entry_id: int, *, result: str, answer: str = ""
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        """Apply one self-judged review, settling every fifth encounter."""
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM words WHERE id = ?", (entry_id,)).fetchone()
            if row is None:
                return None, None
            if bool(row["archived"]):
                return None, None
            library_id = int(row["library_id"])

            score_row = connection.execute(
                "SELECT total_score FROM library_scores WHERE library_id = ?",
                (library_id,),
            ).fetchone()
            global_score = float(score_row["total_score"] if score_row else 0)
            outcome = apply_review(
                contribution=float(row["contribution"] or 0),
                review_count=int(row["review_count"] or 0),
                correct_count=int(row["correct_count"] or 0),
                block_correct=int(row["block_correct"] or 0),
                block_reviews=int(row["block_reviews"] or 0),
                result=result,
                global_score=global_score,
            )
            state = outcome["state"]
            settlement = outcome["block_settlement"]
            next_count = int(state["review_count"])
            now = utc_now()

            last_block_accuracy = (
                state["last_block_accuracy"]
                if state["last_block_accuracy"] is not None
                else row["last_block_accuracy"]
            )
            last_block_delta = (
                state["last_block_delta"]
                if state["last_block_delta"] is not None
                else row["last_block_delta"]
            )

            connection.execute(
                """
                UPDATE words
                SET contribution = ?, review_count = ?, correct_count = ?, block_correct = ?,
                    block_reviews = ?, last_block_accuracy = ?, last_block_delta = ?,
                    last_reviewed_at = ?, last_result = ?
                WHERE id = ?
                """,
                (
                    state["contribution"],
                    next_count,
                    state["correct_count"],
                    state["block_correct"],
                    state["block_reviews"],
                    last_block_accuracy,
                    last_block_delta,
                    now,
                    state["last_result"],
                    entry_id,
                ),
            )

            if settlement is not None:
                connection.execute(
                    "UPDATE library_scores SET total_score = ?, updated_at = ? WHERE library_id = ?",
                    (outcome["score_after"], now, library_id),
                )
                connection.execute(
                    """
                    INSERT INTO score_settlements (
                        library_id, word_id, word, kind, correct, total, delta,
                        contribution_after, score_after, created_at
                    ) VALUES (?, ?, ?, 'review', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        library_id,
                        entry_id,
                        row["word"],
                        settlement["correct"],
                        settlement["total"],
                        settlement["score_delta"],
                        outcome["word_contribution_after"],
                        outcome["score_after"],
                        now,
                    ),
                )

            block_number = (next_count + BLOCK_SIZE - 1) // BLOCK_SIZE
            connection.execute(
                """
                INSERT INTO reviews (
                    word_id, result, answer, score_before, score_after, weight,
                    block_index, block_accuracy, block_delta, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entry_id,
                    result,
                    answer.strip(),
                    outcome["score_before"],
                    outcome["score_after"],
                    0.0,
                    block_number,
                    settlement["accuracy"] if settlement else None,
                    settlement["score_delta"] if settlement else None,
                    now,
                ),
            )

        entry = self.get_entry(entry_id)
        if entry is None:
            return None, None
        outcome["block_index"] = block_number
        return entry, outcome

    def archive_entry(
        self, entry_id: int
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None, dict[str, Any] | None]:
        """Archive a word and settle its maximum contribution into the shared score."""
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM words WHERE id = ?", (entry_id,)).fetchone()
            if row is None:
                return None, None, None
            if bool(row["archived"]):
                return None, None, None
            library_id = int(row["library_id"])

            score_row = connection.execute(
                "SELECT total_score FROM library_scores WHERE library_id = ?",
                (library_id,),
            ).fetchone()
            global_score = float(score_row["total_score"] if score_row else 0)
            now = utc_now()
            settled = archive_contribution(float(row["contribution"] or 0), global_score)

            connection.execute(
                """
                UPDATE words
                SET contribution = ?, archived = 1, archived_at = ?
                WHERE id = ?
                """,
                (settled["contribution_after"], now, entry_id),
            )
            connection.execute(
                "UPDATE library_scores SET total_score = ?, updated_at = ? WHERE library_id = ?",
                (settled["score_after"], now, library_id),
            )
            connection.execute(
                """
                INSERT INTO score_settlements (
                    library_id, word_id, word, kind, correct, total, delta,
                    contribution_after, score_after, created_at
                ) VALUES (?, ?, ?, 'archive', NULL, NULL, ?, ?, ?, ?)
                """,
                (
                    library_id,
                    entry_id,
                    row["word"],
                    settled["score_delta"],
                    settled["contribution_after"],
                    settled["score_after"],
                    now,
                ),
            )

        entry = self.get_entry(entry_id)
        if entry is None:
            return None, None, None
        settlement = {
            "kind": "archive",
            "score_before": settled["score_before"],
            "score_after": settled["score_after"],
            "delta": settled["score_delta"],
            "contribution_after": settled["contribution_after"],
            "word_delta": settled["word_delta"],
        }
        return entry, self.overview(library_id), settlement

    def overview(self, library_id: int = DEFAULT_LIBRARY_ID) -> dict[str, Any]:
        with self.connect() as connection:
            score_row = connection.execute(
                "SELECT total_score FROM library_scores WHERE library_id = ?",
                (library_id,),
            ).fetchone()
            counts = connection.execute(
                """
                SELECT
                    COUNT(*) AS total_words,
                    COALESCE(SUM(archived), 0) AS archived_words,
                    COALESCE(SUM(review_count), 0) AS total_reviews
                FROM words
                WHERE library_id = ?
                """,
                (library_id,),
            ).fetchone()
            settlement_row = connection.execute(
                "SELECT COUNT(*) AS settlement_count FROM score_settlements WHERE library_id = ?",
                (library_id,),
            ).fetchone()
            trend_rows = list(
                connection.execute(
                    """
                    SELECT id, word_id, word, kind, correct, total, delta,
                           contribution_after, score_after, created_at
                    FROM score_settlements
                    WHERE library_id = ?
                    ORDER BY id DESC
                    LIMIT 25
                    """,
                    (library_id,),
                ).fetchall()
            )

        score = round_score(score_row["total_score"] if score_row else 0)
        trend = [
            {
                "id": row["id"],
                "word_id": row["word_id"],
                "word": row["word"],
                "kind": row["kind"],
                "correct": row["correct"],
                "total": row["total"],
                "delta": round(float(row["delta"]), 4),
                "contribution_after": round(float(row["contribution_after"]), 4),
                "score_after": round(float(row["score_after"]), 4),
                "created_at": row["created_at"],
            }
            for row in reversed(trend_rows)
        ]
        return {
            "library_id": library_id,
            "score": score,
            "level": level_for_score(score),
            "score_progress": score_progress(score),
            "total_words": int(counts["total_words"]),
            "archived_words": int(counts["archived_words"]),
            "total_reviews": int(counts["total_reviews"]),
            "settlement_count": int(settlement_row["settlement_count"]),
            "max_word_contribution": MAX_WORD_CONTRIBUTION,
            "trend": trend,
        }

    def import_payload(
        self, payload: dict[str, Any], library_id: int = DEFAULT_LIBRARY_ID
    ) -> dict[str, Any]:
        """Merge a versioned export into the current library.

        Existing words keep their review history and archive state; their
        content is merged. New words bring their review contribution with them,
        so importing into an empty database reconstructs the original score.
        Re-importing the same file is therefore idempotent.
        """
        if not isinstance(payload, dict):
            raise ValueError("不是 SeeEnglish 词库文件。")
        if payload.get("format") != "seeenglish.library":
            raise ValueError("文件格式不是 SeeEnglish 词库。")
        if payload.get("version") != 1:
            raise ValueError("词库文件版本不受支持。")
        raw_words = payload.get("words")
        if not isinstance(raw_words, list):
            raise ValueError("词库文件缺少 words 列表。")
        if len(raw_words) > 10_000:
            raise ValueError("词库文件过大，最多支持 10000 个词条。")

        now = utc_now()
        items: list[dict[str, Any]] = []
        seen: set[str] = set()
        for raw in raw_words:
            if not isinstance(raw, dict):
                raise ValueError("词库文件里有无效的词条。")
            word = " ".join(str(raw.get("word") or "").strip().split())
            normalized = normalize(word)
            if not normalized or not WORD_RE.fullmatch(normalized):
                raise ValueError(f"词库文件里有无效的单词：{word or '（空）'}")
            if normalized in seen:
                raise ValueError(f"词库文件里有重复词条：{word}")
            seen.add(normalized)

            forms = _import_strings(raw.get("forms"), 40, 80, words_only=True)
            sentences = _import_strings(raw.get("sentences"), 100, 2000)
            note_value = raw.get("note")
            note = note_value.strip()[:5000] if isinstance(note_value, str) else ""
            related = _import_strings(raw.get("related"), 40, 80, words_only=True)

            archived_value = raw.get("archived")
            archived = (
                archived_value is True
                or archived_value == 1
                or (
                    isinstance(archived_value, str)
                    and archived_value.strip().lower() in {"true", "1", "yes"}
                )
            )
            contribution = _import_float(raw.get("contribution")) or 0.0
            contribution = max(0.0, min(MAX_WORD_CONTRIBUTION, contribution))
            if archived:
                contribution = MAX_WORD_CONTRIBUTION

            block_reviews = _import_int(raw.get("block_reviews"), minimum=0, maximum=BLOCK_SIZE)
            block_correct = _import_int(raw.get("block_correct"), minimum=0, maximum=block_reviews)
            review_count = _import_int(raw.get("review_count"), minimum=0, maximum=1_000_000)
            correct_count = _import_int(raw.get("correct_count"), minimum=0, maximum=review_count)
            last_accuracy = _import_float(raw.get("last_block_accuracy"))
            if last_accuracy is not None:
                last_accuracy = max(0.0, min(1.0, last_accuracy))
            last_result = raw.get("last_result")
            if last_result not in {"correct", "incorrect"}:
                last_result = None
            last_reviewed_value = raw.get("last_reviewed_at")
            last_reviewed_at = (
                last_reviewed_value.strip()[:40]
                if isinstance(last_reviewed_value, str) and last_reviewed_value.strip()
                else None
            )

            items.append(
                {
                    "word": word,
                    "normalized": normalized,
                    "forms": forms,
                    "sentences": sentences,
                    "note": note,
                    "related": related,
                    "contribution": round_word_contribution(contribution),
                    "review_count": review_count,
                    "correct_count": correct_count,
                    "block_correct": block_correct,
                    "block_reviews": block_reviews,
                    "last_block_accuracy": last_accuracy,
                    "last_block_delta": _import_float(raw.get("last_block_delta")),
                    "last_reviewed_at": last_reviewed_at,
                    "last_result": last_result,
                    "archived": 1 if archived else 0,
                    "archived_at": _import_timestamp(raw.get("archived_at"), now)
                    if archived
                    else None,
                    "created_at": _import_timestamp(raw.get("created_at"), now),
                    "updated_at": _import_timestamp(raw.get("updated_at"), now),
                }
            )

        if not items:
            return {"imported": 0, "merged": 0, "total": 0}

        with self.connect() as connection:
            existing_rows = list(
                connection.execute(
                    "SELECT * FROM words WHERE library_id = ?", (library_id,)
                ).fetchall()
            )
            existing_before = {row["normalized"] for row in existing_rows}
            new_ids: list[int] = []
            new_contribution = 0.0

            for item in items:
                if item["normalized"] in existing_before:
                    continue
                cursor = connection.execute(
                    """
                    INSERT INTO words (
                        library_id, word, normalized, forms, sentences, note, related_ids,
                        created_at, updated_at, contribution, review_count,
                        correct_count, block_correct, block_reviews,
                        last_block_accuracy, last_block_delta, last_reviewed_at,
                        last_result, archived, archived_at
                    ) VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        library_id,
                        item["word"],
                        item["normalized"],
                        json.dumps(item["forms"], ensure_ascii=False),
                        json.dumps(item["sentences"], ensure_ascii=False),
                        item["note"],
                        item["created_at"],
                        item["updated_at"],
                        item["contribution"],
                        item["review_count"],
                        item["correct_count"],
                        item["block_correct"],
                        item["block_reviews"],
                        item["last_block_accuracy"],
                        item["last_block_delta"],
                        item["last_reviewed_at"],
                        item["last_result"],
                        item["archived"],
                        item["archived_at"],
                    ),
                )
                new_ids.append(int(cursor.lastrowid or 0))
                new_contribution += item["contribution"]

            rows = list(
                connection.execute(
                    "SELECT * FROM words WHERE library_id = ?", (library_id,)
                ).fetchall()
            )
            by_normalized = {row["normalized"]: row for row in rows}
            by_id = {row["id"]: row for row in rows}
            merged_count = 0

            for item in items:
                row = by_normalized.get(item["normalized"])
                if row is None:
                    continue
                if item["normalized"] in existing_before:
                    merged_count += 1

                forms = _json_list(row["forms"])
                seen_forms = {value.lower() for value in forms}
                for form in item["forms"]:
                    if form.lower() not in seen_forms:
                        forms.append(form)
                        seen_forms.add(form.lower())

                sentences = _json_list(row["sentences"])
                seen_sentences = {value.lower() for value in sentences}
                for sentence in item["sentences"]:
                    if sentence.lower() not in seen_sentences:
                        sentences.append(sentence)
                        seen_sentences.add(sentence.lower())

                note = str(row["note"] or "")
                if item["note"]:
                    if not note:
                        note = item["note"]
                    elif item["note"].lower() not in note.lower():
                        note = f"{note}\n\n{item['note']}"

                related_words = [
                    by_id[related_id]["word"]
                    for related_id in _json_ids(row["related_ids"])
                    if related_id in by_id
                ]
                seen_related = {value.lower() for value in related_words}
                for related_word in item["related"]:
                    if related_word.lower() not in seen_related:
                        related_words.append(related_word)
                        seen_related.add(related_word.lower())

                related_ids: list[int] = []
                for related_word in related_words:
                    related_row = by_normalized.get(normalize(related_word))
                    if (
                        related_row is not None
                        and related_row["id"] != row["id"]
                        and related_row["id"] not in related_ids
                    ):
                        related_ids.append(related_row["id"])

                connection.execute(
                    """
                    UPDATE words
                    SET forms = ?, sentences = ?, note = ?, related_ids = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        json.dumps(forms, ensure_ascii=False),
                        json.dumps(sentences, ensure_ascii=False),
                        note,
                        json.dumps(related_ids),
                        now,
                        row["id"],
                    ),
                )

            if new_contribution > 0 and new_ids:
                score_row = connection.execute(
                    "SELECT total_score FROM library_scores WHERE library_id = ?",
                    (library_id,),
                ).fetchone()
                score_before = round_score(score_row["total_score"] if score_row else 0)
                score_after = round_score(score_before + new_contribution)
                connection.execute(
                    "UPDATE library_scores SET total_score = ?, updated_at = ? WHERE library_id = ?",
                    (score_after, now, library_id),
                )
                connection.execute(
                    """
                    INSERT INTO score_settlements (
                        library_id, word_id, word, kind, correct, total, delta,
                        contribution_after, score_after, created_at
                    ) VALUES (?, ?, ?, 'import', NULL, NULL, ?, 0, ?, ?)
                    """,
                    (
                        library_id,
                        new_ids[0],
                        "导入词库",
                        round(new_contribution, 4),
                        score_after,
                        now,
                    ),
                )

        return {
            "imported": len(new_ids),
            "merged": merged_count,
            "total": len(items),
        }

    def export_payload(self, library_id: int = DEFAULT_LIBRARY_ID) -> dict[str, Any]:
        """A versioned, import-friendly JSON snapshot of one library."""
        library = self.get_library(library_id)
        entries = self.all_entries(library_id)
        overview = self.overview(library_id)
        return {
            "format": "seeenglish.library",
            "version": 1,
            "exported_at": utc_now(),
            "library": {
                "id": library_id,
                "name": library["name"] if library else DEFAULT_LIBRARY_NAME,
                "group_name": library["group_name"] if library else DEFAULT_LIBRARY_GROUP,
            },
            "score": overview["score"],
            "total_words": overview["total_words"],
            "archived_words": overview["archived_words"],
            "words": [
                {
                    "word": entry["word"],
                    "forms": entry["forms"],
                    "sentences": entry["sentences"],
                    "note": entry["note"],
                    "related": [relation["word"] for relation in entry["related"]],
                    "contribution": entry["contribution"],
                    "review_count": entry["review_count"],
                    "correct_count": entry["correct_count"],
                    "block_correct": entry["block_correct"],
                    "block_reviews": entry["block_reviews"],
                    "last_block_accuracy": entry["last_block_accuracy"],
                    "last_block_delta": entry["last_block_delta"],
                    "last_reviewed_at": entry["last_reviewed_at"],
                    "last_result": entry["last_result"],
                    "archived": entry["archived"],
                    "archived_at": entry["archived_at"],
                    "created_at": entry["created_at"],
                    "updated_at": entry["updated_at"],
                }
                for entry in entries
            ],
        }

    def daily_score_series(
        self, days: int = 30, library_id: int = DEFAULT_LIBRARY_ID
    ) -> list[dict[str, Any]]:
        days = max(1, min(90, int(days)))
        today = datetime.now().astimezone().date()
        start = today - timedelta(days=days - 1)

        with self.connect() as connection:
            rows = list(
                connection.execute(
                    "SELECT created_at, score_after FROM score_settlements "
                    "WHERE library_id = ? ORDER BY id ASC",
                    (library_id,),
                ).fetchall()
            )

        by_day: dict[Any, float] = {}
        for row in rows:
            try:
                moment = datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00"))
            except ValueError:
                continue
            by_day[moment.astimezone().date()] = round(float(row["score_after"]), 4)

        current = 0.0
        for day in sorted(by_day):
            if day < start:
                current = by_day[day]
            else:
                break

        series: list[dict[str, Any]] = []
        previous = current
        for offset in range(days):
            day = start + timedelta(days=offset)
            if day in by_day:
                current = by_day[day]
            series.append(
                {
                    "date": day.isoformat(),
                    "label": day.strftime("%m.%d"),
                    "score": round(current, 4),
                    "delta": round(current - previous, 4),
                }
            )
            previous = current
        return series

    def profile_data(self, library_id: int = DEFAULT_LIBRARY_ID) -> dict[str, Any]:
        return {
            "library_id": library_id,
            "stats": self.stats(library_id),
            "overview": self.overview(library_id),
            "daily": self.daily_score_series(30, library_id),
        }

    def stats(self, library_id: int = DEFAULT_LIBRARY_ID) -> dict[str, Any]:
        rows = self._rows(library_id)
        sentences: list[str] = []
        forms: list[str] = []
        relations = 0
        with_notes = 0
        total_reviews = 0
        reviewed_words = 0
        archived_words = 0
        for row in rows:
            sentences.extend(_json_list(row["sentences"]))
            forms.extend(_json_list(row["forms"]))
            relations += len(_json_ids(row["related_ids"]))
            if row["note"].strip():
                with_notes += 1
            review_count = int(row["review_count"] or 0)
            total_reviews += review_count
            if review_count > 0:
                reviewed_words += 1
            if bool(row["archived"]):
                archived_words += 1
        with self.connect() as connection:
            score_row = connection.execute(
                "SELECT total_score FROM library_scores WHERE library_id = ?",
                (library_id,),
            ).fetchone()
        return {
            "library_id": library_id,
            "words": len(rows),
            "sentences": len(sentences),
            "forms": len(forms),
            "relations": relations,
            "with_notes": with_notes,
            "total_reviews": total_reviews,
            "reviewed_words": reviewed_words,
            "archived_words": archived_words,
            "global_score": round_score(score_row["total_score"] if score_row else 0),
            "updated_at": rows[0]["updated_at"] if rows else None,
        }
