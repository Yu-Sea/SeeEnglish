"""FastAPI application for SeeEnglish."""

from __future__ import annotations

import json
import os
import subprocess
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from .db import Database
from .matching import find_matches
from .morphology import WORD_RE, normalize
from .scoring import pick_review_word

ROOT = Path(__file__).resolve().parent.parent
WEB_DIST = Path(os.environ.get("SEEENGLISH_WEB_DIST", ROOT / "web" / "dist"))
GUI_DIST = Path(os.environ.get("SEEENGLISH_GUI_DIST", ROOT / "gui" / "dist"))
db = Database()


class EntryDraft(BaseModel):
    sentence: str = Field(default="", max_length=2000)
    note: str = Field(default="", max_length=5000)
    related_ids: list[int] = Field(default_factory=list, max_length=40)


class NewEntry(EntryDraft):
    word: str = Field(min_length=1, max_length=80)
    source_form: str | None = Field(default=None, max_length=80)


class Supplement(EntryDraft):
    source_form: str | None = Field(default=None, max_length=80)


class WordUpdate(BaseModel):
    word: str = Field(min_length=1, max_length=80)
    note: str = Field(default="", max_length=5000)
    sentences: list[str] = Field(default_factory=list, max_length=100)
    related_ids: list[int] = Field(default_factory=list, max_length=40)


class ReviewSubmission(BaseModel):
    result: Literal["correct", "incorrect"]
    answer: str = Field(default="", max_length=2000)


class LibraryPayload(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    group_name: str = Field(default="未分组", max_length=30)


def _clean_library_name(value: str) -> str:
    name = " ".join(value.strip().split())
    if not name:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_library_name", "message": "请给词库起一个名字。"},
        )
    return name[:40]


def _clean_library_group(value: str) -> str:
    group = " ".join(value.strip().split()) or "未分组"
    return group[:30]


def _require_library(library_id: int) -> dict[str, Any]:
    library = db.get_library(library_id)
    if library is None:
        raise HTTPException(status_code=404, detail="没有找到这个词库。")
    return library


def _clean_word(value: str) -> tuple[str, str]:
    word = " ".join(value.strip().split())
    normalized = normalize(word)
    if not normalized or not WORD_RE.fullmatch(normalized):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_word", "message": "请输入英文单词或短语（可包含空格、连字符和撇号）。"},
        )
    return word, normalized


def _clean_form(value: str | None) -> str:
    if not value:
        return ""
    form = " ".join(value.strip().split())
    normalized = normalize(form)
    return form if normalized and WORD_RE.fullmatch(normalized) else ""


def _clean_text(value: str) -> str:
    return value.strip()


def _clean_sentences(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        sentence = value.strip()[:2000]
        if sentence and sentence.lower() not in seen:
            cleaned.append(sentence)
            seen.add(sentence.lower())
    return cleaned[:100]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init()
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        title="SeeEnglish API",
        description="Local vocabulary index for the SeeEnglish desktop UI.",
        version="0.6.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/api", tags=["meta"])
    def api_index() -> dict[str, Any]:
        return {
            "name": "SeeEnglish API",
            "version": "0.6.0",
            "status": "ready",
            "endpoints": {
                "health": "/api/health",
                "libraries": "/api/libraries",
                "words": "/api/words?library_id=1",
                "match": "/api/words/match?q=apples&library_id=1",
                "review_overview": "/api/review/overview?library_id=1",
                "review_next": "/api/review/next?library_id=1",
                "review_submit": "/api/review/{entry_id}",
                "archive_word": "/api/words/{entry_id}/archive",
                "unarchive_word": "/api/words/{entry_id}/unarchive",
                "update_word": "/api/words/{entry_id}",
                "delete_word": "/api/words/{entry_id}",
                "export": "/api/export?library_id=1",
                "import": "/api/import?library_id=1",
                "profile": "/api/profile?library_id=1",
                "stats": "/api/stats?library_id=1",
                "gui": "/gui/",
                "open_desktop": "/api/desktop/open",
                "docs": "/docs",
            },
        }

    @application.get("/api/health", tags=["meta"])
    def health() -> dict[str, Any]:
        return {"status": "ok", "service": "seeenglish", "version": "0.6.0"}

    @application.get("/api/libraries", tags=["libraries"])
    def list_libraries() -> dict[str, Any]:
        return {"items": db.libraries()}

    @application.post("/api/libraries", status_code=201, tags=["libraries"])
    def create_library(payload: LibraryPayload) -> dict[str, Any]:
        try:
            return db.create_library(
                name=_clean_library_name(payload.name),
                group_name=_clean_library_group(payload.group_name),
            )
        except ValueError as error:
            raise HTTPException(
                status_code=409,
                detail={"code": "library_exists", "message": str(error)},
            ) from error

    @application.patch("/api/libraries/{library_id}", tags=["libraries"])
    def update_library(library_id: int, payload: LibraryPayload) -> dict[str, Any]:
        _require_library(library_id)
        try:
            library = db.update_library(
                library_id,
                name=_clean_library_name(payload.name),
                group_name=_clean_library_group(payload.group_name),
            )
        except ValueError as error:
            raise HTTPException(
                status_code=409,
                detail={"code": "library_exists", "message": str(error)},
            ) from error
        if library is None:
            raise HTTPException(status_code=404, detail="没有找到这个词库。")
        return library

    @application.delete("/api/libraries/{library_id}", tags=["libraries"])
    def delete_library(library_id: int) -> dict[str, Any]:
        try:
            deleted = db.delete_library(library_id)
        except ValueError as error:
            raise HTTPException(
                status_code=409,
                detail={"code": "default_library", "message": str(error)},
            ) from error
        if not deleted:
            raise HTTPException(status_code=404, detail="没有找到这个词库。")
        return {"deleted": True, "library_id": library_id}

    @application.post("/api/desktop/open", tags=["meta"])
    def open_desktop(request: Request) -> dict[str, Any]:
        launcher = ROOT / "SeeEnglish GUI.vbs"
        script = ROOT / "gui_app.py"
        pythonw = ROOT / ".venv" / "Scripts" / "pythonw.exe"
        python = ROOT / ".venv" / "Scripts" / "python.exe"
        executable = pythonw if pythonw.exists() else python
        port = request.url.port or 8765
        environment = os.environ.copy()
        environment["SEEENGLISH_DB"] = str(db.path)
        if launcher.exists():
            subprocess.Popen(
                ["wscript.exe", str(launcher), str(port)],
                cwd=str(ROOT),
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "DETACHED_PROCESS", 0),
            )
        elif script.exists() and executable.exists():
            subprocess.Popen(
                [str(executable), str(script), "--port", str(port)],
                cwd=str(ROOT),
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "DETACHED_PROCESS", 0),
            )
        else:
            raise HTTPException(
                status_code=503,
                detail={"code": "desktop_missing", "message": "桌面启动器还没有准备好。"},
            )
        return {"opened": True, "port": port}

    @application.get("/api/stats", tags=["meta"])
    def stats(library_id: int = Query(default=1, ge=1)) -> dict[str, Any]:
        _require_library(library_id)
        return db.stats(library_id)

    @application.get("/api/profile", tags=["meta"])
    def profile(library_id: int = Query(default=1, ge=1)) -> dict[str, Any]:
        _require_library(library_id)
        return db.profile_data(library_id)

    @application.post("/api/import", tags=["words"])
    def import_library(
        payload: dict[str, Any], library_id: int = Query(default=1, ge=1)
    ) -> dict[str, Any]:
        _require_library(library_id)
        try:
            return db.import_payload(payload, library_id)
        except ValueError as error:
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_import", "message": str(error)},
            ) from error

    @application.get("/api/export", tags=["meta"])
    def export_library(library_id: int = Query(default=1, ge=1)) -> Response:
        _require_library(library_id)
        payload = db.export_payload(library_id)
        payload["app_version"] = __version__
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        filename = f"seeenglish-library-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        return Response(
            content=body,
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )

    @application.get("/api/review/overview", tags=["review"])
    def review_overview(library_id: int = Query(default=1, ge=1)) -> dict[str, Any]:
        _require_library(library_id)
        return db.overview(library_id)

    @application.get("/api/review/next", tags=["review"])
    def next_review(
        library_id: int = Query(default=1, ge=1),
        exclude_id: int | None = Query(default=None, ge=1),
    ) -> dict[str, Any]:
        _require_library(library_id)
        entries = db.all_entries(library_id)
        entry = pick_review_word(entries, exclude_id=exclude_id)
        if entry is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "empty_review_pool",
                    "message": "词库里暂时没有需要复习的词。",
                },
            )
        return {
            "word": entry,
            "pool_size": sum(1 for item in entries if not item["archived"]),
            "overview": db.overview(library_id),
        }

    @application.post("/api/review/{entry_id}", tags=["review"])
    def submit_review(
        entry_id: int,
        payload: ReviewSubmission,
        library_id: int | None = Query(default=None, ge=1),
    ) -> dict[str, Any]:
        current = db.get_entry(entry_id)
        if current is None:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        if library_id is not None and current["library_id"] != library_id:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        if current["archived"]:
            raise HTTPException(
                status_code=409,
                detail={"code": "archived_word", "message": "这个词已经归档，不再参与复习。"},
            )
        entry, outcome = db.record_review(
            entry_id,
            result=payload.result,
            answer=payload.answer,
        )
        if entry is None or outcome is None:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        return {
            "word": entry,
            "outcome": outcome,
            "overview": db.overview(current["library_id"]),
        }

    @application.post("/api/words/{entry_id}/archive", tags=["words"])
    def archive_word(entry_id: int) -> dict[str, Any]:
        current = db.get_entry(entry_id)
        if current is None:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        if current["archived"]:
            raise HTTPException(
                status_code=409,
                detail={"code": "already_archived", "message": "这个词已经归档了。"},
            )
        entry, overview, settlement = db.archive_entry(entry_id)
        if entry is None or overview is None or settlement is None:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        return {"word": entry, "overview": overview, "settlement": settlement}

    @application.post("/api/words/{entry_id}/unarchive", tags=["words"])
    def unarchive_word(entry_id: int) -> dict[str, Any]:
        entry, overview = db.unarchive_entry(entry_id)
        if entry is None or overview is None:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        return {"word": entry, "overview": overview}

    @application.get("/api/words/match", tags=["words"])
    def match_words(
        q: str = Query(default="", max_length=80),
        library_id: int = Query(default=1, ge=1),
    ) -> dict[str, Any]:
        _require_library(library_id)
        query = " ".join(q.strip().split())
        matches = find_matches(db.all_entries(library_id), query)
        return {"query": query, "matches": matches}

    @application.get("/api/words", tags=["words"])
    def list_words(
        q: str = Query(default="", max_length=120),
        limit: int = Query(default=500, ge=1, le=1000),
        library_id: int = Query(default=1, ge=1),
    ) -> dict[str, Any]:
        _require_library(library_id)
        items = db.list_entries(q, limit=limit, library_id=library_id)
        return {"items": items, "total": len(items), "query": q}

    @application.get("/api/words/{entry_id}", tags=["words"])
    def get_word(entry_id: int) -> dict[str, Any]:
        entry = db.get_entry(entry_id)
        if entry is None:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        return entry

    @application.patch("/api/words/{entry_id}", tags=["words"])
    def update_word(entry_id: int, payload: WordUpdate) -> dict[str, Any]:
        current = db.get_entry(entry_id)
        if current is None:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        word, normalized = _clean_word(payload.word)
        existing = db.get_by_word(normalized, current["library_id"])
        if existing is not None and existing["id"] != entry_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "word_exists",
                    "message": "另一个词条已经使用了这个拼写。",
                    "entry_id": existing["id"],
                },
            )
        entry = db.update_entry(
            entry_id,
            word=word,
            normalized=normalized,
            note=_clean_text(payload.note),
            sentences=_clean_sentences(payload.sentences),
            related_ids=payload.related_ids,
        )
        if entry is None:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        return entry

    @application.delete("/api/words/{entry_id}", tags=["words"])
    def delete_word(entry_id: int) -> dict[str, Any]:
        deleted, overview = db.delete_entry(entry_id)
        if deleted is None or overview is None:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        return {"deleted": deleted, "overview": overview}

    @application.post("/api/words", status_code=201, tags=["words"])
    def create_word(
        payload: NewEntry, library_id: int = Query(default=1, ge=1)
    ) -> dict[str, Any]:
        _require_library(library_id)
        word, normalized = _clean_word(payload.word)
        existing = db.get_by_word(normalized, library_id)
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "word_exists",
                    "message": "这个词已经建立了索引，可以继续补充它。",
                    "entry_id": existing["id"],
                },
            )
        return db.create_entry(
            word=word,
            normalized=normalized,
            sentence=_clean_text(payload.sentence),
            note=_clean_text(payload.note),
            related_ids=payload.related_ids,
            library_id=library_id,
        )

    @application.post("/api/words/{entry_id}/supplement", tags=["words"])
    def supplement_word(entry_id: int, payload: Supplement) -> dict[str, Any]:
        entry = db.supplement_entry(
            entry_id,
            source_form=_clean_form(payload.source_form),
            sentence=_clean_text(payload.sentence),
            note=_clean_text(payload.note),
            related_ids=payload.related_ids,
        )
        if entry is None:
            raise HTTPException(status_code=404, detail="没有找到这个词条。")
        return entry

    if GUI_DIST.exists():
        application.mount("/gui", StaticFiles(directory=GUI_DIST, html=True), name="gui")

    if WEB_DIST.exists():
        application.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
    else:

        @application.get("/", include_in_schema=False)
        def api_only_root() -> dict[str, Any]:
            return {
                "name": "SeeEnglish API",
                "message": "前端还没有构建。先运行 cd web && npm run build，然后重启 API。",
                "api": "/api",
                "docs": "/docs",
            }

    return application


app = create_app()
