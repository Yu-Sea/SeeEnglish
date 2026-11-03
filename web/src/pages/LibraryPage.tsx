import {
  Archive,
  ArchiveRestore,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  FileText,
  LayoutGrid,
  LibraryBig,
  Link2,
  List,
  LoaderCircle,
  Pencil,
  Plus,
  Quote,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { RelationPicker } from '../components/RelationPicker';
import type { LibraryLayout } from '../preferences';
import type { LibrarySummary, RelatedWord, TabId, WordEntry } from '../types';

interface LibraryPageProps {
  refreshKey: number;
  libraryId: number;
  libraries: LibrarySummary[];
  currentLibrary: LibrarySummary | null;
  onSelectLibrary: (libraryId: number) => void;
  onLibrariesChanged: () => Promise<LibrarySummary[]>;
  immersive: boolean;
  layout: LibraryLayout;
  onLayoutChange: (layout: LibraryLayout) => void;
  onNavigate: (tab: TabId) => void;
  onOpenRelated: (wordId: number) => void;
  focusWordId: number | null;
  onFocusWordConsumed: () => void;
  onChanged: () => void;
}

type LibraryView = 'words' | 'sentences';
type ArchiveFilter = 'all' | 'active' | 'archived';
type TransferView = 'choice' | 'import';
type LibraryModalView = 'create' | 'edit' | null;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const WORD_COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function letterGroup(word: string): string {
  const first = word.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

function groupWords(entries: WordEntry[]): { letter: string; entries: WordEntry[] }[] {
  const groups = new Map<string, WordEntry[]>();
  for (const entry of entries) {
    const letter = letterGroup(entry.word);
    const bucket = groups.get(letter);
    if (bucket) bucket.push(entry);
    else groups.set(letter, [entry]);
  }
  const order = [...LETTERS, '#'];
  return order
    .filter((letter) => groups.has(letter))
    .map((letter) => ({
      letter,
      entries: (groups.get(letter) ?? []).sort((left, right) =>
        WORD_COLLATOR.compare(left.word, right.word),
      ),
    }));
}

interface SentenceItem {
  key: string;
  text: string;
  entry: WordEntry;
  index: number;
}

interface SentenceEditTarget {
  entryId: number;
  index: number;
  word: string;
  text: string;
}

interface SentenceDeleteTarget {
  key: string;
  entryId: number;
  index: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请再试一次。';
}

function isLibraryPayload(value: unknown): value is {
  format: 'seeenglish.library';
  version: number;
  words: unknown[];
} {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  if (payload.format !== 'seeenglish.library' || payload.version !== 1) return false;
  if (!Array.isArray(payload.words) || payload.words.length > 10000) return false;
  return payload.words.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const word = (item as Record<string, unknown>).word;
    return typeof word === 'string' && word.trim().length > 0;
  });
}

export function LibraryPage({
  refreshKey,
  libraryId,
  libraries,
  currentLibrary,
  onSelectLibrary,
  onLibrariesChanged,
  immersive,
  layout,
  onLayoutChange,
  onNavigate,
  onOpenRelated,
  focusWordId,
  onFocusWordConsumed,
  onChanged,
}: LibraryPageProps) {
  const [entries, setEntries] = useState<WordEntry[]>([]);
  const [view, setView] = useState<LibraryView>('words');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('all');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [sentenceActionKey, setSentenceActionKey] = useState<string | null>(null);
  const [sentenceDelete, setSentenceDelete] = useState<SentenceDeleteTarget | null>(null);
  const [exporting, setExporting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferView, setTransferView] = useState<TransferView>('choice');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionClosing, setSelectionClosing] = useState(false);
  const [selectionReturning, setSelectionReturning] = useState(false);
  const selectionCloseTimer = useRef<number | null>(null);
  const selectionReturnTimer = useRef<number | null>(null);
  const [previewLibrary, setPreviewLibrary] = useState<LibrarySummary | null>(null);
  const [previewEntries, setPreviewEntries] = useState<WordEntry[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [libraryModal, setLibraryModal] = useState<LibraryModalView>(null);
  const [libraryBeingEdited, setLibraryBeingEdited] = useState<LibrarySummary | null>(null);
  const [libraryNameDraft, setLibraryNameDraft] = useState('');
  const [libraryGroupDraft, setLibraryGroupDraft] = useState('');
  const [librarySaving, setLibrarySaving] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [deleteLibraryTarget, setDeleteLibraryTarget] = useState<LibrarySummary | null>(null);
  const [deletingLibrary, setDeletingLibrary] = useState(false);

  const [editingWord, setEditingWord] = useState<WordEntry | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSentences, setEditSentences] = useState('');
  const [editRelations, setEditRelations] = useState<RelatedWord[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const [editingSentence, setEditingSentence] = useState<SentenceEditTarget | null>(null);
  const [sentenceEditText, setSentenceEditText] = useState('');
  const [savingSentence, setSavingSentence] = useState(false);
  const [sentenceEditError, setSentenceEditError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .listWords('', 1000, libraryId)
      .then((data) => {
        if (!active) return;
        setEntries(data.items);
      })
      .catch(() => {
        if (!active) return;
        setError('读取词库失败，请确认本地 API 正在运行。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey, attempt, libraryId]);

  useEffect(() => {
    if (focusWordId === null) return;
    const target = entries.find((entry) => entry.id === focusWordId);
    if (!target) {
      if (!loading) onFocusWordConsumed();
      return;
    }
    setView('words');
    setArchiveFilter('all');
    setQuery('');
    setExpandedId(focusWordId);
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .querySelector(`[data-entry-id="${focusWordId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    onFocusWordConsumed();
    return () => window.cancelAnimationFrame(frame);
  }, [entries, focusWordId, loading, onFocusWordConsumed]);

  useEffect(() => {
    if (!previewLibrary) {
      setPreviewEntries([]);
      setPreviewError('');
      return;
    }
    let active = true;
    setPreviewLoading(true);
    setPreviewError('');
    api
      .listWords('', 1000, previewLibrary.id)
      .then((data) => {
        if (active) setPreviewEntries(data.items);
      })
      .catch(() => {
        if (active) setPreviewError('读取这个词库的内容失败。');
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [previewLibrary]);

  useEffect(() => {
    return () => {
      if (selectionCloseTimer.current !== null) {
        window.clearTimeout(selectionCloseTimer.current);
      }
      if (selectionReturnTimer.current !== null) {
        window.clearTimeout(selectionReturnTimer.current);
      }
    };
  }, []);

  const needle = query.trim().toLowerCase();

  const filteredWords = useMemo(
    () =>
      entries.filter((entry) => {
        if (archiveFilter === 'active' && entry.archived) return false;
        if (archiveFilter === 'archived' && !entry.archived) return false;
        if (!needle) return true;
        return (
          entry.word.toLowerCase().includes(needle) ||
          entry.note.toLowerCase().includes(needle) ||
          entry.sentences.some((sentence) => sentence.toLowerCase().includes(needle)) ||
          entry.forms.some((form) => form.toLowerCase().includes(needle)) ||
          entry.related.some((related) => related.word.toLowerCase().includes(needle))
        );
      }),
    [entries, needle, archiveFilter],
  );

  const wordGroups = useMemo(() => groupWords(filteredWords), [filteredWords]);

  const sentenceItems = useMemo<SentenceItem[]>(() => {    return entries.flatMap((entry) =>
      entry.sentences.map((sentence, index) => ({
        key: `${entry.id}-${index}`,
        text: sentence,
        entry,
        index,
      })),
    ).filter((item) => {
      if (!needle) return true;
      return (
        item.text.toLowerCase().includes(needle) ||
        item.entry.word.toLowerCase().includes(needle)
      );
    });
  }, [entries, needle]);

  const wordCount = entries.length;
  const sentenceCount = useMemo(
    () => entries.reduce((total, entry) => total + entry.sentences.length, 0),
    [entries],
  );
  const relatedCount = useMemo(
    () => entries.reduce((total, entry) => total + entry.related.length, 0),
    [entries],
  );
  const formCount = useMemo(
    () => entries.reduce((total, entry) => total + entry.forms.length, 0),
    [entries],
  );
  const archivedCount = useMemo(
    () => entries.filter((entry) => entry.archived).length,
    [entries],
  );

  const replaceEntry = (updated: WordEntry) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry)),
    );
  };

  const openWordEditor = (entry: WordEntry) => {
    setEditingWord(entry);
    setEditWord(entry.word);
    setEditNote(entry.note);
    setEditSentences(entry.sentences.join('\n'));
    setEditRelations(entry.related.map((item) => ({ ...item })));
    setEditError('');
    setDeleteTargetId(null);
  };

  const saveWordEditor = async () => {
    if (!editingWord || savingEdit) return;
    const word = editWord.trim();
    if (!word) {
      setEditError('单词不能为空。');
      return;
    }

    setSavingEdit(true);
    setEditError('');
    try {
      const updated = await api.updateWord(editingWord.id, {
        word,
        note: editNote.trim(),
        sentences: editSentences
          .split(/\r?\n/)
          .map((sentence) => sentence.trim())
          .filter(Boolean),
        related_ids: editRelations.map((item) => item.id),
      });
      replaceEntry(updated);
      setEditingWord(null);
      setExpandedId(updated.id);
      onChanged();
    } catch (updateError) {
      setEditError(messageOf(updateError));
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleArchive = async (entry: WordEntry) => {
    if (busyId !== null) return;
    setBusyId(entry.id);
    setActionError('');
    try {
      const result = entry.archived
        ? await api.unarchiveWord(entry.id)
        : await api.archiveWord(entry.id);
      replaceEntry(result.word);
      setSentenceActionKey(null);
      onChanged();
    } catch (archiveError) {
      setActionError(messageOf(archiveError));
    } finally {
      setBusyId(null);
    }
  };

  const deleteWord = async (entry: WordEntry) => {
    if (busyId !== null) return;
    setBusyId(entry.id);
    setActionError('');
    try {
      await api.deleteWord(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setExpandedId(null);
      setDeleteTargetId(null);
      setSentenceActionKey(null);
      onChanged();
    } catch (deleteError) {
      setActionError(messageOf(deleteError));
    } finally {
      setBusyId(null);
    }
  };

  const openSentenceEditor = (item: SentenceItem) => {
    setEditingSentence({
      entryId: item.entry.id,
      index: item.index,
      word: item.entry.word,
      text: item.text,
    });
    setSentenceEditText(item.text);
    setSentenceEditError('');
    setSentenceDelete(null);
  };

  const saveSentenceEditor = async () => {
    if (!editingSentence || savingSentence) return;
    const text = sentenceEditText.trim();
    if (!text) {
      setSentenceEditError('句子不能为空。');
      return;
    }
    const entry = entries.find((item) => item.id === editingSentence.entryId);
    if (!entry) {
      setSentenceEditError('找不到这个句子的所属单词。');
      return;
    }

    const nextSentences = entry.sentences.map((sentence, index) =>
      index === editingSentence.index ? text : sentence,
    );
    setSavingSentence(true);
    setSentenceEditError('');
    try {
      const updated = await api.updateWord(entry.id, {
        word: entry.word,
        note: entry.note,
        sentences: nextSentences,
        related_ids: entry.related.map((item) => item.id),
      });
      replaceEntry(updated);
      setEditingSentence(null);
      setSentenceActionKey(null);
      onChanged();
    } catch (sentenceError) {
      setSentenceEditError(messageOf(sentenceError));
    } finally {
      setSavingSentence(false);
    }
  };

  const deleteSentence = async (target: SentenceDeleteTarget) => {
    if (busyId !== null) return;
    const entry = entries.find((item) => item.id === target.entryId);
    if (!entry) return;
    setBusyId(entry.id);
    setActionError('');
    try {
      const updated = await api.updateWord(entry.id, {
        word: entry.word,
        note: entry.note,
        sentences: entry.sentences.filter((_, index) => index !== target.index),
        related_ids: entry.related.map((item) => item.id),
      });
      replaceEntry(updated);
      setSentenceDelete(null);
      setSentenceActionKey(null);
      onChanged();
    } catch (sentenceError) {
      setActionError(messageOf(sentenceError));
    } finally {
      setBusyId(null);
    }
  };

  const exportLibrary = async () => {
    if (exporting) return;
    setExporting(true);
    setActionError('');
    try {
      const { blob, filename } = await api.exportLibrary(libraryId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setActionError(messageOf(exportError));
    } finally {
      setExporting(false);
    }
  };

  const openTransfer = () => {
    setTransferOpen(true);
    setTransferView('choice');
    setImportError('');
    setDragActive(false);
  };

  const closeTransfer = () => {
    if (importing) return;
    setTransferOpen(false);
    setTransferView('choice');
    setImportError('');
    setDragActive(false);
  };

  const importFile = async (file: File | undefined) => {
    if (!file || importing) return;
    setImportError('');
    setDragActive(false);
    if (file.size > 20 * 1024 * 1024) {
      setImportError('文件太大，词库 JSON 不能超过 20MB。');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.json')) {
      setImportError('请选择 SeeEnglish 导出的 JSON 文件。');
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('文件不是有效的 JSON。');
      }
      if (!isLibraryPayload(payload)) {
        throw new Error('这不是 SeeEnglish 导出的词库文件，或版本不受支持。');
      }
      await api.importLibrary(payload, libraryId);
      setTransferOpen(false);
      setTransferView('choice');
      setImportError('');
      onChanged();
    } catch (importFailure) {
      setImportError(messageOf(importFailure));
    } finally {
      setImporting(false);
    }
  };

  const enterSelection = () => {
    if (selectionCloseTimer.current !== null) {
      window.clearTimeout(selectionCloseTimer.current);
      selectionCloseTimer.current = null;
    }
    if (selectionReturnTimer.current !== null) {
      window.clearTimeout(selectionReturnTimer.current);
      selectionReturnTimer.current = null;
    }
    setSelectionClosing(false);
    setSelectionReturning(false);
    setSelectionMode(true);
    setPreviewLibrary(null);
    setPreviewError('');
    setDeleteLibraryTarget(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finishSelectionReturn = () => {
    setSelectionMode(false);
    setSelectionClosing(false);
    setPreviewLibrary(null);
    setPreviewError('');
    setDeleteLibraryTarget(null);
    setSelectionReturning(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (selectionReturnTimer.current !== null) {
      window.clearTimeout(selectionReturnTimer.current);
    }
    selectionReturnTimer.current = window.setTimeout(() => {
      setSelectionReturning(false);
      selectionReturnTimer.current = null;
    }, 480);
  };

  const leaveSelection = () => {
    if (selectionClosing) return;
    setSelectionClosing(true);
    if (selectionCloseTimer.current !== null) {
      window.clearTimeout(selectionCloseTimer.current);
    }
    selectionCloseTimer.current = window.setTimeout(() => {
      finishSelectionReturn();
      selectionCloseTimer.current = null;
    }, 180);
  };

  const chooseLibrary = (library: LibrarySummary) => {
    if (library.id === libraryId) {
      leaveSelection();
      return;
    }
    if (selectionClosing) return;
    setSelectionClosing(true);
    if (selectionCloseTimer.current !== null) {
      window.clearTimeout(selectionCloseTimer.current);
    }
    selectionCloseTimer.current = window.setTimeout(() => {
      onSelectLibrary(library.id);
      setSelectionMode(false);
      setSelectionClosing(false);
      setPreviewLibrary(null);
      setPreviewError('');
      setDeleteLibraryTarget(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      selectionCloseTimer.current = null;
    }, 180);
  };

  const openCreateLibrary = () => {
    setLibraryBeingEdited(null);
    setLibraryNameDraft('');
    setLibraryGroupDraft('未分组');
    setLibraryError('');
    setLibraryModal('create');
  };

  const openEditLibrary = (library: LibrarySummary) => {
    setLibraryBeingEdited(library);
    setLibraryNameDraft(library.name);
    setLibraryGroupDraft(library.group_name);
    setLibraryError('');
    setLibraryModal('edit');
  };

  const closeLibraryModal = () => {
    if (librarySaving) return;
    setLibraryModal(null);
    setLibraryBeingEdited(null);
    setLibraryError('');
  };

  const saveLibrary = async () => {
    if (librarySaving) return;
    const name = libraryNameDraft.trim();
    if (!name) {
      setLibraryError('请给词库起一个名字。');
      return;
    }
    setLibrarySaving(true);
    setLibraryError('');
    try {
      const payload = {
        name: name.slice(0, 40),
        group_name: (libraryGroupDraft.trim() || '未分组').slice(0, 30),
      };
      const saved = libraryBeingEdited
        ? await api.updateLibrary(libraryBeingEdited.id, payload)
        : await api.createLibrary(payload);
      const nextLibraries = await onLibrariesChanged();
      const latest = nextLibraries.find((library) => library.id === saved.id) ?? saved;
      setLibraryModal(null);
      setLibraryBeingEdited(null);
      if (previewLibrary?.id === latest.id) setPreviewLibrary(latest);
      if (!libraryBeingEdited) setPreviewLibrary(latest);
    } catch (error) {
      setLibraryError(messageOf(error));
    } finally {
      setLibrarySaving(false);
    }
  };

  const removeLibrary = async () => {
    if (!deleteLibraryTarget || deletingLibrary) return;
    const target = deleteLibraryTarget;
    setDeletingLibrary(true);
    setLibraryError('');
    try {
      await api.deleteLibrary(target.id);
      const nextLibraries = await onLibrariesChanged();
      if (target.id === libraryId) {
        const fallback =
          nextLibraries.find((library) => library.is_default) ?? nextLibraries[0];
        if (fallback) onSelectLibrary(fallback.id);
      }
      if (previewLibrary?.id === target.id) setPreviewLibrary(null);
      setDeleteLibraryTarget(null);
      onChanged();
    } catch (error) {
      setLibraryError(messageOf(error));
    } finally {
      setDeletingLibrary(false);
    }
  };

  const renderWordCard = (entry: WordEntry, index: number) => (
    <WordCard
      key={entry.id}
      entry={entry}
      index={index}
      isOpen={expandedId === entry.id}
      busy={busyId === entry.id}
      deletePending={deleteTargetId === entry.id}
      onToggle={() => {
        setExpandedId(expandedId === entry.id ? null : entry.id);
        setDeleteTargetId(null);
      }}
      onEdit={() => openWordEditor(entry)}
      onArchive={() => void toggleArchive(entry)}
      onDeleteRequest={() => {
        setDeleteTargetId(entry.id);
        setActionError('');
      }}
      onDeleteCancel={() => setDeleteTargetId(null)}
      onDeleteConfirm={() => void deleteWord(entry)}
      onOpenRelated={onOpenRelated}
    />
  );

  if (selectionMode) {
    const activePreview = previewLibrary
      ? libraries.find((library) => library.id === previewLibrary.id) ?? previewLibrary
      : null;
    const previewSentences = previewEntries.flatMap((entry) =>
      entry.sentences.map((sentence, index) => ({
        key: `${entry.id}-${index}`,
        text: sentence,
        word: entry.word,
      })),
    );

    return (
      <section
        className={`page page--library page--library-select ${
          selectionClosing ? 'is-closing' : ''
        }`}
      >
        <header
          className={`library-select-head ${
            immersive ? 'library-select-head--immersive' : ''
          }`}
        >
          {!immersive && (
            <div>
              <div className="eyebrow">
                <span className="eyebrow__line" />
                LIBRARY · COLLECTION
              </div>
              <h1 className="page-title">把词，分开放。</h1>
              <p className="page-subtitle">
                每个词库有自己的单词、句子、分数和复习记录。选择一个继续，或者为下一个主题再建一个。
              </p>
            </div>
          )}
          <button
            type="button"
            className="library-select-circle"
            onClick={leaveSelection}
            disabled={selectionClosing}
            aria-label="返回当前词库"
            title="返回当前词库"
          >
            <LibraryBig size={18} strokeWidth={1.8} />
            <span>返回词库</span>
          </button>
        </header>

        {activePreview ? (
          <div className="library-preview">
            <button
              type="button"
              className="library-preview__back"
              onClick={() => setPreviewLibrary(null)}
            >
              <ArrowLeft size={14} strokeWidth={1.8} />
              所有词库
            </button>

            <header className="library-preview__head">
              <span className="library-preview__cover">
                <span>{activePreview.name.slice(0, 1).toUpperCase()}</span>
                <LibraryBig size={17} strokeWidth={1.7} />
              </span>
              <div className="library-preview__identity">
                <span className="library-card__group">{activePreview.group_name}</span>
                <h2>{activePreview.name}</h2>
                <p>
                  {activePreview.is_default
                    ? '默认词库始终保留，也不能删除。'
                    : '这个词库里的词、句子和复习记录与其他词库互不影响。'}
                </p>
              </div>
              <div className="library-preview__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => openEditLibrary(activePreview)}
                >
                  <Pencil size={14} strokeWidth={1.8} />
                  编辑
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => chooseLibrary(activePreview)}
                >
                  <Check size={15} strokeWidth={2} />
                  {activePreview.id === libraryId ? '回到该词库' : '选择该词库'}
                </button>
              </div>
            </header>

            <div className="library-preview__stats">
              <span>
                <b>{activePreview.word_count}</b>
                <small>单词</small>
              </span>
              <span>
                <b>{activePreview.sentence_count}</b>
                <small>句子</small>
              </span>
              <span>
                <b>{activePreview.archived_count}</b>
                <small>已归档</small>
              </span>
              <span>
                <b>{activePreview.score.toFixed(3)}</b>
                <small>分数</small>
              </span>
            </div>

            {previewLoading ? (
              <div className="library-preview__loading">
                <LoaderCircle className="spin" size={18} strokeWidth={1.7} />
                正在打开这个词库…
              </div>
            ) : previewError ? (
              <div className="library-preview__error">{previewError}</div>
            ) : (
              <div className="library-preview__columns">
                <section className="library-preview__panel">
                  <header>
                    <h3>单词</h3>
                    <span>{String(previewEntries.length).padStart(2, '0')}</span>
                  </header>
                  {previewEntries.length === 0 ? (
                    <p className="library-preview__empty">这个词库还没有单词。</p>
                  ) : (
                    <div className="library-preview__word-list">
                      {previewEntries.map((entry) => (
                        <div className="library-preview__word" key={entry.id}>
                          <b>{entry.word}</b>
                          <span>{entry.note || entry.sentences[0] || '还没有联想。'}</span>
                          <small>{entry.sentences.length} 句</small>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="library-preview__panel">
                  <header>
                    <h3>句子</h3>
                    <span>{String(previewSentences.length).padStart(2, '0')}</span>
                  </header>
                  {previewSentences.length === 0 ? (
                    <p className="library-preview__empty">这个词库还没有句子。</p>
                  ) : (
                    <div className="library-preview__sentence-list">
                      {previewSentences.map((sentence) => (
                        <p className="library-preview__sentence" key={sentence.key}>
                          <Quote size={13} strokeWidth={1.7} />
                          <span>{sentence.text}</span>
                          <small>from {sentence.word}</small>
                        </p>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="library-select-intro">
              <span>
                {String(libraries.length).padStart(2, '0')} 个词库 · 默认词库始终保留
              </span>
              <button type="button" className="button button--primary" onClick={openCreateLibrary}>
                <Plus size={16} strokeWidth={2} />
                新增词库
              </button>
            </div>

            <div className="library-card-grid">
              {libraries.map((library) => {
                const isCurrent = library.id === libraryId;
                return (
                  <article
                    className={`library-card ${isCurrent ? 'is-current' : ''}`}
                    key={library.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreviewLibrary(library)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setPreviewLibrary(library);
                      }
                    }}
                  >
                    <div className="library-card__top">
                      <span className="library-card__mark">
                        <LibraryBig size={17} strokeWidth={1.7} />
                      </span>
                      <span className="library-card__group">{library.group_name}</span>
                      {library.is_default && (
                        <span className="library-card__default">默认</span>
                      )}
                      {isCurrent && (
                        <span className="library-card__current">
                          <Check size={10} strokeWidth={2.2} />
                          当前
                        </span>
                      )}
                      {!library.is_default && (
                        <button
                          type="button"
                          className="library-card__delete"
                          aria-label={`删除词库 ${library.name}`}
                          title="删除词库"
                          onClick={(event) => {
                            event.stopPropagation();
                            setLibraryError('');
                            setDeleteLibraryTarget(library);
                          }}
                        >
                          <Trash2 size={13} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>

                    <h3>{library.name}</h3>
                    <p>
                      {library.is_default
                        ? '默认词库，始终保留。'
                        : '独立保存，独立复习。'}
                    </p>

                    <div className="library-card__stats">
                      <span>
                        <b>{library.word_count}</b>
                        <small>单词</small>
                      </span>
                      <span>
                        <b>{library.sentence_count}</b>
                        <small>句子</small>
                      </span>
                      <span>
                        <b>{library.score.toFixed(3)}</b>
                        <small>分数</small>
                      </span>
                    </div>

                    <span className="library-card__enter">
                      查看内容
                      <ArrowRight size={13} strokeWidth={1.9} />
                    </span>
                  </article>
                );
              })}

              <button
                type="button"
                className="library-card library-card--new"
                onClick={openCreateLibrary}
              >
                <span className="library-card__plus">
                  <Plus size={20} strokeWidth={1.8} />
                </span>
                <b>新建词库</b>
                <small>给下一个主题留一个位置</small>
              </button>
            </div>
          </>
        )}

        {libraryError && !libraryModal && !deleteLibraryTarget && (
          <div className="library-action-error library-select-error" role="alert">
            <span>{libraryError}</span>
            <button type="button" onClick={() => setLibraryError('')} aria-label="关闭错误提示">
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        )}

        {libraryModal && (
          <LibraryModal
            title={libraryBeingEdited ? '编辑词库' : '新建词库'}
            eyebrow={libraryBeingEdited ? 'EDIT LIBRARY' : 'NEW LIBRARY'}
            onClose={closeLibraryModal}
          >
            <form
              className="library-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveLibrary();
              }}
            >
              <label className="library-edit-field">
                <span>词库名称</span>
                <input
                  value={libraryNameDraft}
                  onChange={(event) => setLibraryNameDraft(event.target.value)}
                  maxLength={40}
                  autoFocus
                  placeholder="例如：考研阅读、电影台词、工作英语"
                />
              </label>
              <label className="library-edit-field">
                <span>分组</span>
                <input
                  value={libraryGroupDraft}
                  onChange={(event) => setLibraryGroupDraft(event.target.value)}
                  maxLength={30}
                  list="library-group-options"
                  placeholder="例如：考试、阅读、日常"
                />
                <small>分组只是给词库做归类，不会影响单词内容。</small>
              </label>
              <datalist id="library-group-options">
                <option value="未分组" />
                <option value="考试" />
                <option value="阅读" />
                <option value="日常" />
                <option value="工作" />
              </datalist>
              {libraryError && <p className="library-edit-error">{libraryError}</p>}
              <div className="library-modal__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={closeLibraryModal}
                  disabled={librarySaving}
                >
                  取消
                </button>
                <button type="submit" className="button button--primary" disabled={librarySaving}>
                  {librarySaving ? (
                    <LoaderCircle className="spin" size={16} strokeWidth={1.8} />
                  ) : (
                    <Check size={16} strokeWidth={2} />
                  )}
                  {librarySaving ? '保存中…' : libraryBeingEdited ? '保存修改' : '创建词库'}
                </button>
              </div>
            </form>
          </LibraryModal>
        )}

        {deleteLibraryTarget && (
          <LibraryModal
            title="删除词库"
            eyebrow="DELETE LIBRARY"
            onClose={() => {
              if (!deletingLibrary) {
                setDeleteLibraryTarget(null);
                setLibraryError('');
              }
            }}
          >
            <div className="library-delete-library">
              <p>
                确定删除「<b>{deleteLibraryTarget.name}</b>」吗？这个词库里的{' '}
                {deleteLibraryTarget.word_count} 个单词和 {deleteLibraryTarget.sentence_count}{' '}
                个句子会一起移除。
              </p>
              <p className="library-delete-library__warning">
                删除后无法恢复。默认词库不会出现在这个操作里。
              </p>
              {libraryError && <p className="library-edit-error">{libraryError}</p>}
              <div className="library-modal__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    setDeleteLibraryTarget(null);
                    setLibraryError('');
                  }}
                  disabled={deletingLibrary}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => void removeLibrary()}
                  disabled={deletingLibrary}
                >
                  {deletingLibrary ? (
                    <LoaderCircle className="spin" size={16} strokeWidth={1.8} />
                  ) : (
                    <Trash2 size={15} strokeWidth={1.8} />
                  )}
                  {deletingLibrary ? '删除中…' : '确认删除'}
                </button>
              </div>
            </div>
          </LibraryModal>
        )}
      </section>
    );
  }

  return (
    <section
      className={`page page--library ${selectionReturning ? 'is-returning' : ''}`}
    >
      {!immersive && (
        <header className="page-head page-head--library">
          <div className="eyebrow">
            <span className="eyebrow__line" />
            LIBRARY · 03
            <span className="library-head-current">{currentLibrary?.name ?? '默认词库'}</span>
          </div>
          <div className="page-head__row">
            <div>
              <h1 className="page-title">你的语言索引。</h1>
              <p className="page-subtitle">
                当前词库「{currentLibrary?.name ?? '默认词库'}」 · 每一个词、每一句语境，都只留在这台电脑里。
              </p>
            </div>
            <div className="library-head-actions">
              <button type="button" className="button button--outline" onClick={() => onNavigate('add')}>
                <Plus size={16} strokeWidth={2} />
                记一个新词
              </button>
            </div>
          </div>
          <div className="library-stats" aria-label="词库统计">
            <span>
              <b>{String(wordCount).padStart(2, '0')}</b> 词条
            </span>
            <span>
              <b>{String(sentenceCount).padStart(2, '0')}</b> 例句
            </span>
            <span>
              <b>{String(relatedCount).padStart(2, '0')}</b> 关联
            </span>
            <span>
              <b>{String(formCount).padStart(2, '0')}</b> 形态
            </span>
            <span>
              <b>{String(archivedCount).padStart(2, '0')}</b> 已归档
            </span>
          </div>
        </header>
      )}

      <div className="library-toolbar">
        <div className="library-toolbar__left">
          <div className="segmented" role="tablist" aria-label="词库视图">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'words'}
              className={view === 'words' ? 'is-active' : ''}
              onClick={() => {
                setView('words');
                setSentenceActionKey(null);
                setSentenceDelete(null);
              }}
            >
              单词
              <span>{pad(entries.length)}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'sentences'}
              className={view === 'sentences' ? 'is-active' : ''}
              onClick={() => {
                setView('sentences');
                setExpandedId(null);
                setDeleteTargetId(null);
              }}
            >
              句子
              <span>{pad(sentenceCount)}</span>
            </button>
          </div>

          {view === 'words' && (
            <div className="library-filter" role="group" aria-label="按归档状态筛选">
              <span className="library-filter__label">筛选</span>
              <button
                type="button"
                className={archiveFilter === 'all' ? 'is-active' : ''}
                aria-pressed={archiveFilter === 'all'}
                onClick={() => setArchiveFilter('all')}
              >
                全部
              </button>
              <button
                type="button"
                className={archiveFilter === 'active' ? 'is-active' : ''}
                aria-pressed={archiveFilter === 'active'}
                onClick={() => setArchiveFilter('active')}
              >
                未归档
              </button>
              <button
                type="button"
                className={archiveFilter === 'archived' ? 'is-active' : ''}
                aria-pressed={archiveFilter === 'archived'}
                onClick={() => setArchiveFilter('archived')}
              >
                已归档
              </button>
            </div>
          )}
        </div>

        <div className="library-toolbar__right">
          <div className="library-search">
            <Search size={16} strokeWidth={1.8} aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={view === 'words' ? '搜索单词、联想或关联词…' : '搜索例句…'}
              aria-label="搜索词库"
              spellCheck={false}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>

          {immersive ? (
            <div className="library-immersive-tools" role="group" aria-label="词库工具">
              <span
                className="library-immersive-tools__name"
                title={`当前词库：${currentLibrary?.name ?? '默认词库'}`}
              >
                {currentLibrary?.name ?? '默认词库'}
              </span>
              <span className="library-immersive-tools__divider" aria-hidden="true" />
              <button
                type="button"
                className="library-immersive-tools__transfer"
                onClick={openTransfer}
                title="导出 / 导入词库"
              >
                <ArrowDownUp size={14} strokeWidth={1.9} />
                <span>导出 / 导入</span>
              </button>
              <span className="library-immersive-tools__divider" aria-hidden="true" />
              <button
                type="button"
                className={`library-select-trigger ${
                  selectionReturning ? 'library-select-trigger--expanding' : ''
                }`}
                onClick={enterSelection}
                title={`选择词库（当前：${currentLibrary?.name ?? '默认词库'}）`}
              >
                <LibraryBig size={14} strokeWidth={1.9} />
                <span>选择词库</span>
              </button>
              <span className="library-immersive-tools__divider" aria-hidden="true" />
              <LibraryLayoutSwitch layout={layout} onLayoutChange={onLayoutChange} />
            </div>
          ) : (
            <>
              <button
                type="button"
                className="library-select-trigger library-select-trigger--surface"
                onClick={openTransfer}
                disabled={exporting}
                title="导出 / 导入词库"
              >
                {exporting ? (
                  <LoaderCircle className="spin" size={14} strokeWidth={1.9} />
                ) : (
                  <ArrowDownUp size={14} strokeWidth={1.9} />
                )}
                <span>{exporting ? '导出中…' : '导出 / 导入'}</span>
              </button>
              <button
                type="button"
                className={`library-select-trigger library-select-trigger--surface ${
                  selectionReturning ? 'library-select-trigger--expanding' : ''
                }`}
                onClick={enterSelection}
                title={`选择词库（当前：${currentLibrary?.name ?? '默认词库'}）`}
              >
                <LibraryBig size={14} strokeWidth={1.9} />
                <span>选择词库</span>
              </button>
              <LibraryLayoutSwitch
                layout={layout}
                onLayoutChange={onLayoutChange}
                surface
              />
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="library-action-error" role="alert">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} aria-label="关闭错误提示">
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      )}

      {loading && entries.length === 0 && (
        <div className="library-loading glass">
          <LoaderCircle className="spin" size={20} strokeWidth={1.8} />
          正在打开你的词库…
        </div>
      )}

      {error && (
        <div className="library-error glass" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button button--outline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            重试
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="library-empty glass">
          <span className="library-empty__mark">
            <FileText size={26} strokeWidth={1.5} />
          </span>
          <h2>这里还没有词。</h2>
          <p>从今天遇见的一个单词开始，留下它的语境和你的理解。</p>
          <button type="button" className="button button--primary" onClick={() => onNavigate('add')}>
            去记第一个词
            <ArrowRight size={17} strokeWidth={1.9} />
          </button>
        </div>
      )}

      {!error && entries.length > 0 && view === 'words' && (
        filteredWords.length === 0 ? (
          <div className="library-no-results">
            {archiveFilter === 'archived'
              ? '还没有已归档的词。'
              : archiveFilter === 'active'
                ? '所有词都已归档，或者没有符合搜索的词。'
                : `没有找到与「${query.trim()}」匹配的词。`}
          </div>
        ) : layout === 'grid' ? (
          <div className="word-groups">
            {wordGroups.map((group) => (
              <section className="word-group" key={group.letter}>
                <header className="word-group__head">
                  <span className="word-group__letter">{group.letter}</span>
                  <span className="word-group__rule" aria-hidden="true" />
                  <span className="word-group__count">
                    {String(group.entries.length).padStart(2, '0')} 词
                  </span>
                </header>
                <div className="word-grid">
                  {group.entries.map((entry, index) => renderWordCard(entry, index))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="word-list">{filteredWords.map(renderWordCard)}</div>
        )
      )}

      {!error && entries.length > 0 && view === 'sentences' && (
        <div className="sentence-list">
          {sentenceItems.length === 0 ? (
            <div className="library-no-results">
              {query.trim() ? `没有找到包含「${query.trim()}」的例句。` : '还没有保存任何例句。'}
            </div>
          ) : (
            sentenceItems.map((item) => {
              const isOpen = sentenceActionKey === item.key;
              const isDeleting = sentenceDelete?.key === item.key;
              return (
                <article className={`sentence-card glass ${isOpen ? 'is-open' : ''}`} key={item.key}>
                  <div className="sentence-card__main">
                    <span className="sentence-card__number">{pad(item.index + 1)}</span>
                    <button
                      type="button"
                      className="sentence-card__body"
                      onClick={() => {
                        setSentenceActionKey(isOpen ? null : item.key);
                        setSentenceDelete(null);
                      }}
                      aria-expanded={isOpen}
                    >
                      <Quote className="sentence-card__quote" size={18} strokeWidth={1.6} />
                      <p>{item.text}</p>
                      <span className="sentence-card__source">
                        from <b>{item.entry.word}</b>
                        {item.entry.archived && (
                          <span className="sentence-card__archived">已归档</span>
                        )}
                      </span>
                    </button>
                  </div>

                  {isOpen && (
                    <div className="sentence-actions" role="group" aria-label="句子的操作">
                      <button type="button" onClick={() => openSentenceEditor(item)}>
                        <Pencil size={14} strokeWidth={1.8} />
                        修改句子
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleArchive(item.entry)}
                        disabled={busyId === item.entry.id}
                      >
                        {busyId === item.entry.id ? (
                          <LoaderCircle className="spin" size={14} strokeWidth={1.8} />
                        ) : item.entry.archived ? (
                          <ArchiveRestore size={14} strokeWidth={1.8} />
                        ) : (
                          <Archive size={14} strokeWidth={1.8} />
                        )}
                        {item.entry.archived ? '取消归档所属单词' : '归档所属单词'}
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => {
                          setSentenceDelete({
                            key: item.key,
                            entryId: item.entry.id,
                            index: item.index,
                          });
                          setActionError('');
                        }}
                      >
                        <Trash2 size={14} strokeWidth={1.8} />
                        删除句子
                      </button>
                    </div>
                  )}

                  {isDeleting && (
                    <div className="sentence-delete-confirm" role="alert">
                      <p>只删除这一句，单词本身和它的其他记录会保留。</p>
                      <div className="sentence-delete-confirm__actions">
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => setSentenceDelete(null)}
                          disabled={busyId === item.entry.id}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="button button--danger"
                          onClick={() => {
                            if (sentenceDelete) void deleteSentence(sentenceDelete);
                          }}
                          disabled={busyId === item.entry.id}
                        >
                          {busyId === item.entry.id ? (
                            <LoaderCircle className="spin" size={15} strokeWidth={1.8} />
                          ) : (
                            <Trash2 size={15} strokeWidth={1.8} />
                          )}
                          {busyId === item.entry.id ? '删除中…' : '确认删除'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {transferOpen && (
        <LibraryModal title="导出 / 导入词库" eyebrow="LIBRARY · TRANSFER" onClose={closeTransfer}>
          {transferView === 'choice' ? (
            <div className="library-transfer">
              <p className="library-transfer__intro">
                把「{currentLibrary?.name ?? '默认词库'}」带走，或者把一份之前的备份合并进这个词库。
              </p>
              <div className="library-transfer__options">
                <button
                  type="button"
                  className="library-transfer__option"
                  onClick={() => {
                    setTransferOpen(false);
                    void exportLibrary();
                  }}
                  disabled={exporting}
                >
                  <span className="library-transfer__icon">
                    <Download size={21} strokeWidth={1.6} />
                  </span>
                  <span>
                    <b>导出词库</b>
                    <small>下载完整 JSON 备份，包含复习和归档状态</small>
                  </span>
                  <ArrowRight size={16} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  className="library-transfer__option"
                  onClick={() => {
                    setTransferView('import');
                    setImportError('');
                  }}
                  disabled={importing}
                >
                  <span className="library-transfer__icon library-transfer__icon--import">
                    <Upload size={21} strokeWidth={1.6} />
                  </span>
                  <span>
                    <b>导入词库</b>
                    <small>拖拽或选择一份之前导出的 JSON 文件</small>
                  </span>
                  <ArrowRight size={16} strokeWidth={1.8} />
                </button>
              </div>
              <p className="library-transfer__note">
                导入会合并到当前词库，不覆盖已有词条的复习进度和归档状态。
              </p>
            </div>
          ) : (
            <div className="library-import">
              <button
                type="button"
                className="library-import__back"
                onClick={() => {
                  if (!importing) {
                    setTransferView('choice');
                    setImportError('');
                    setDragActive(false);
                  }
                }}
                disabled={importing}
              >
                <ArrowLeft size={14} strokeWidth={1.8} />
                返回
              </button>

              <button
                type="button"
                className={`library-import__drop ${dragActive ? 'is-dragging' : ''} ${
                  importing ? 'is-busy' : ''
                }`}
                onClick={() => importInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (!importing) setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!importing) setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  if (!importing) void importFile(event.dataTransfer.files?.[0]);
                }}
                disabled={importing}
              >
                <span className="library-import__mark">
                  {importing ? (
                    <LoaderCircle className="spin" size={26} strokeWidth={1.6} />
                  ) : (
                    <Upload size={26} strokeWidth={1.55} />
                  )}
                </span>
                <b>{importing ? '正在导入…' : '拖拽 JSON 到这里'}</b>
                <small>{importing ? '正在合并词条，请稍候' : '或点击选择文件'}</small>
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void importFile(file);
                }}
              />

              {importError && (
                <p className="library-import__error" role="alert">
                  {importError}
                </p>
              )}

              <p className="library-import__hint">
                只接受 SeeEnglish 导出的 <code>seeenglish.library</code> v1 JSON。
                导入到当前词库；格式不正确时不会写入任何数据。
              </p>
            </div>
          )}
        </LibraryModal>
      )}

      {editingWord && (
        <LibraryModal
          title="修改词条"
          eyebrow="EDIT ENTRY"
          onClose={() => {
            if (!savingEdit) setEditingWord(null);
          }}
        >
          <form
            className="library-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveWordEditor();
            }}
          >
            <label className="library-edit-field">
              <span>单词</span>
              <input
                value={editWord}
                onChange={(event) => setEditWord(event.target.value)}
                autoFocus
                spellCheck={false}
              />
            </label>
            <label className="library-edit-field">
              <span>个人联想</span>
              <textarea
                value={editNote}
                onChange={(event) => setEditNote(event.target.value)}
                rows={4}
                placeholder="中文释义、词根、画面感……"
              />
            </label>
            <label className="library-edit-field">
              <span>例句</span>
              <textarea
                value={editSentences}
                onChange={(event) => setEditSentences(event.target.value)}
                rows={5}
                placeholder="一行一句；可以清空后重新写。"
              />
              <small>每行保存为一句。</small>
            </label>
            <div className="library-edit-field">
              <span>关联词</span>
              <RelationPicker
                words={entries}
                selected={editRelations}
                targetId={editingWord.id}
                onAdd={(word) =>
                  setEditRelations((current) =>
                    current.some((item) => item.id === word.id)
                      ? current
                      : [...current, word],
                  )
                }
                onRemove={(id) =>
                  setEditRelations((current) => current.filter((item) => item.id !== id))
                }
              />
            </div>
            {editError && <p className="library-edit-error">{editError}</p>}
            <div className="library-modal__actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setEditingWord(null)}
                disabled={savingEdit}
              >
                取消
              </button>
              <button type="submit" className="button button--primary" disabled={savingEdit}>
                {savingEdit ? (
                  <LoaderCircle className="spin" size={16} strokeWidth={1.8} />
                ) : (
                  <Check size={16} strokeWidth={2} />
                )}
                {savingEdit ? '保存中…' : '保存修改'}
              </button>
            </div>
          </form>
        </LibraryModal>
      )}

      {editingSentence && (
        <LibraryModal
          title="修改句子"
          eyebrow={`EDIT SENTENCE · ${editingSentence.word}`}
          onClose={() => {
            if (!savingSentence) setEditingSentence(null);
          }}
        >
          <form
            className="library-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSentenceEditor();
            }}
          >
            <label className="library-edit-field">
              <span>句子内容</span>
              <textarea
                value={sentenceEditText}
                onChange={(event) => setSentenceEditText(event.target.value)}
                rows={6}
                autoFocus
                placeholder="写下这个句子的新版本…"
              />
            </label>
            {sentenceEditError && <p className="library-edit-error">{sentenceEditError}</p>}
            <div className="library-modal__actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setEditingSentence(null)}
                disabled={savingSentence}
              >
                取消
              </button>
              <button type="submit" className="button button--primary" disabled={savingSentence}>
                {savingSentence ? (
                  <LoaderCircle className="spin" size={16} strokeWidth={1.8} />
                ) : (
                  <Check size={16} strokeWidth={2} />
                )}
                {savingSentence ? '保存中…' : '保存句子'}
              </button>
            </div>
          </form>
        </LibraryModal>
      )}
    </section>
  );
}

function LibraryLayoutSwitch({
  layout,
  onLayoutChange,
  surface = false,
}: {
  layout: LibraryLayout;
  onLayoutChange: (layout: LibraryLayout) => void;
  surface?: boolean;
}) {
  return (
    <div
      className={`library-layout-switch ${surface ? 'library-layout-switch--surface' : ''}`}
      role="group"
      aria-label="排版"
    >
      <button
        type="button"
        className={layout === 'list' ? 'is-active' : ''}
        aria-pressed={layout === 'list'}
        title="列表布局"
        onClick={() => onLayoutChange('list')}
      >
        <List size={14} strokeWidth={1.9} />
      </button>
      <button
        type="button"
        className={layout === 'grid' ? 'is-active' : ''}
        aria-pressed={layout === 'grid'}
        title="A–Z 栅格布局"
        onClick={() => onLayoutChange('grid')}
      >
        <LayoutGrid size={14} strokeWidth={1.9} />
      </button>
    </div>
  );
}

function WordCard({
  entry,
  index,
  isOpen,
  busy,
  deletePending,
  onToggle,
  onEdit,
  onArchive,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
  onOpenRelated,
}: {
  entry: WordEntry;
  index: number;
  isOpen: boolean;
  busy: boolean;
  deletePending: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
  onOpenRelated: (wordId: number) => void;
}) {
  return (
    <article className={`word-card ${isOpen ? 'is-open' : ''}`} data-entry-id={entry.id}>
      <button
        type="button"
        className="word-card__main"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="word-card__number">{String(index + 1).padStart(3, '0')}</span>
        <span className="word-card__content">
          <span className="word-card__title-line">
            <span className="word-card__word">{entry.word}</span>
            {entry.forms.slice(0, 3).map((form) => (
              <span className="word-card__form" key={form}>
                {form}
              </span>
            ))}
            {entry.forms.length > 3 && (
              <span className="word-card__form">+{entry.forms.length - 3}</span>
            )}
            {entry.archived && (
              <span className="word-card__archived">
                <Archive size={10} strokeWidth={1.8} />
                已归档
              </span>
            )}
          </span>
          <span className="word-card__note">
            {entry.note || entry.sentences[0] || '还没有联想。'}
          </span>
        </span>
        <span className="word-card__meta">
          <span>{String(entry.sentences.length).padStart(2, '0')} 句</span>
          {entry.related.length > 0 && (
            <span>
              <Link2 size={13} strokeWidth={1.8} />
              {entry.related.length}
            </span>
          )}
          {entry.archived ? (
            <span className="word-card__meta-archived">已归档</span>
          ) : (
            <span>{shortDate(entry.updated_at)}</span>
          )}
          <ChevronDown className="word-card__chevron" size={17} strokeWidth={1.8} />
        </span>
      </button>

      {isOpen && (
        <>
          <div className="word-actions" role="group" aria-label={`${entry.word} 的操作`}>
            <button type="button" onClick={onEdit}>
              <Pencil size={14} strokeWidth={1.8} />
              修改
            </button>
            <button type="button" onClick={onArchive} disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={14} strokeWidth={1.8} />
              ) : entry.archived ? (
                <ArchiveRestore size={14} strokeWidth={1.8} />
              ) : (
                <Archive size={14} strokeWidth={1.8} />
              )}
              {entry.archived ? '取消归档' : '归档'}
            </button>
            <button type="button" className="is-danger" onClick={onDeleteRequest}>
              <Trash2 size={14} strokeWidth={1.8} />
              删除
            </button>
          </div>

          {deletePending && (
            <div className="word-delete-confirm" role="alert">
              <p>
                删除后无法恢复。这个词会从词库、复习池和复习记录中移除
                {entry.contribution > 0
                  ? `，总分也会扣除它的 ${entry.contribution.toFixed(3)} 分。`
                  : '。'}
              </p>
              <div className="word-delete-confirm__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={onDeleteCancel}
                  disabled={busy}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={onDeleteConfirm}
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={15} strokeWidth={1.8} />
                  ) : (
                    <Trash2 size={15} strokeWidth={1.8} />
                  )}
                  {busy ? '删除中…' : '确认删除'}
                </button>
              </div>
            </div>
          )}

          <div className="word-card__detail">
            <div className="word-detail-grid">
              <div className="word-detail-block">
                <h4>个人联想</h4>
                <p className={entry.note ? '' : 'is-muted'}>
                  {entry.note || '还没有写下对这个词的理解。'}
                </p>
              </div>
              <div className="word-detail-block">
                <h4>例句</h4>
                {entry.sentences.length > 0 ? (
                  <div className="word-sentences">
                    {entry.sentences.map((sentence) => (
                      <p key={sentence}>
                        <Quote size={13} strokeWidth={1.8} />
                        {sentence}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="is-muted">还没有留下例句。</p>
                )}
              </div>
            </div>

            {entry.related.length > 0 && (
              <div className="word-related">
                <h4>关联词</h4>
                <div className="word-related__chips">
                  {entry.related.map((related) => (
                    <button
                      type="button"
                      className="relation-chip relation-chip--link"
                      key={related.id}
                      onClick={() => onOpenRelated(related.id)}
                      title={`打开 ${related.word}`}
                    >
                      {related.word}
                      <ArrowRight size={11} strokeWidth={1.9} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="word-detail-foot">
              <span>INDEX #{String(entry.id).padStart(3, '0')}</span>
              <span>收录于 {shortDate(entry.created_at)}</span>
              <span>{entry.forms.length} 个记录形态</span>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function LibraryModal({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="library-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="library-modal__panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="library-modal__head">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" className="library-modal__close" onClick={onClose} aria-label="关闭">
            <X size={17} strokeWidth={1.8} />
          </button>
        </header>
        <div className="library-modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
