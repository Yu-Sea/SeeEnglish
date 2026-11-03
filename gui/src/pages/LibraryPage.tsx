import {
  Archive,
  ArchiveRestore,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  LayoutGrid,
  LibraryBig,
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
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import type { LibrarySummary, WordEntry } from '../api';

interface LibraryPageProps {
  libraries: LibrarySummary[];
  library: LibrarySummary;
  refreshKey: number;
  immersive: boolean;
  onSelectLibrary: (libraryId: number) => void;
  onAddLibrary: (name: string, group: string) => Promise<LibrarySummary>;
  onUpdateLibrary: (libraryId: number, name: string, group: string) => Promise<LibrarySummary>;
  onDeleteLibrary: (libraryId: number) => Promise<void>;
  onNavigate: (page: 'capture' | 'review' | 'library' | 'profile') => void;
  onChanged: () => void;
  onToast: (message: string) => void;
  focusWordId: number | null;
  onFocusWordConsumed: () => void;
  onOpenRelated: (wordId: number) => void;
}

type LayoutMode = 'grid' | 'list';
type WordView = 'words' | 'sentences';
type ArchiveFilter = 'all' | 'active' | 'archived';
type CollectionScreen = 'cards' | 'preview';
type DialogKind = 'transfer' | 'library' | 'delete' | 'word' | 'sentence' | null;

interface SentenceItem {
  key: string;
  text: string;
  entry: WordEntry;
  index: number;
}

interface SentenceEdit {
  entry: WordEntry;
  index: number;
}

function Dialog({
  eyebrow,
  title,
  onClose,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`dialog ${wide ? 'dialog--wide' : ''}`} role="dialog" aria-modal="true">
        <header className="dialog__head">
          <div>
            <span className="panel-kicker">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" className="dialog__close" onClick={onClose} aria-label="关闭">
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
      </div>
    </div>
  );
}

function letterOf(word: string): string {
  const first = word.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

function groupWords(words: WordEntry[]): { letter: string; words: WordEntry[] }[] {
  const buckets = new Map<string, WordEntry[]>();
  for (const word of words) {
    const letter = letterOf(word.word);
    const bucket = buckets.get(letter);
    if (bucket) bucket.push(word);
    else buckets.set(letter, [word]);
  }
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat('#');
  return letters
    .filter((letter) => buckets.has(letter))
    .map((letter) => ({
      letter,
      words: [...(buckets.get(letter) ?? [])].sort((a, b) =>
        a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }),
      ),
    }));
}

function isLibraryPayload(value: unknown): value is { format: string; version: number; words: unknown[] } {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.format === 'seeenglish.library' &&
    payload.version === 1 &&
    Array.isArray(payload.words)
  );
}

function WordCard({
  word,
  index,
  isOpen,
  onToggle,
  onEdit,
  onArchive,
  onDelete,
  onOpenRelated,
}: {
  word: WordEntry;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onOpenRelated: (wordId: number) => void;
}) {
  return (
    <article className={`gui-word-card ${isOpen ? 'is-open' : ''}`} data-entry-id={word.id}>
      <button type="button" className="gui-word-card__main" onClick={onToggle} aria-expanded={isOpen}>
        <span className="gui-word-card__num">{String(index + 1).padStart(3, '0')}</span>
        <span className="gui-word-card__content">
          <span className="gui-word-card__title">
            <b>{word.word}</b>
            {word.forms.slice(0, 3).map((form) => (
              <em key={form}>{form}</em>
            ))}
          </span>
          <span className="gui-word-card__note">
            {word.note || word.sentences[0] || '还没有联想。'}
          </span>
        </span>
        <span className="gui-word-card__meta">
          <span>{String(word.sentences.length).padStart(2, '0')} 句</span>
          {word.archived ? <span className="archived">已归档</span> : <span>{word.updated_at.slice(5, 10)}</span>}
          <ChevronDown size={15} strokeWidth={1.8} />
        </span>
      </button>

      {isOpen && (
        <div className="gui-word-card__detail">
          <div className="gui-word-detail">
            <div>
              <span className="field-label">个人联想</span>
              <p>{word.note || '还没有写下对这个词的理解。'}</p>
            </div>
            <div>
              <span className="field-label">例句</span>
              {word.sentences.length ? (
                word.sentences.map((sentence) => (
                  <blockquote key={sentence}>
                    <Quote size={12} strokeWidth={1.7} />
                    {sentence}
                  </blockquote>
                ))
              ) : (
                <p className="muted">还没有留下例句。</p>
              )}
            </div>
          </div>
          {word.related.length > 0 && (
            <div className="gui-word-related">
              <span className="field-label">关联词</span>
              <div className="gui-related-links">
                {word.related.map((related) => (
                  <button
                    type="button"
                    className="gui-related-link"
                    key={related.id}
                    onClick={() => onOpenRelated(related.id)}
                    title={`打开 ${related.word}`}
                  >
                    {related.word}
                    <ArrowRight size={10} strokeWidth={1.9} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="gui-word-actions">
            <button type="button" onClick={onEdit}>
              <Pencil size={13} strokeWidth={1.8} />
              修改
            </button>
            <button type="button" onClick={onArchive}>
              {word.archived ? (
                <ArchiveRestore size={13} strokeWidth={1.8} />
              ) : (
                <Archive size={13} strokeWidth={1.8} />
              )}
              {word.archived ? '取消归档' : '归档'}
            </button>
            <button type="button" className="is-danger" onClick={onDelete}>
              <Trash2 size={13} strokeWidth={1.8} />
              删除
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function LibraryPage({
  libraries,
  library,
  refreshKey,
  immersive,
  onSelectLibrary,
  onAddLibrary,
  onUpdateLibrary,
  onDeleteLibrary,
  onNavigate,
  onChanged,
  onToast,
  focusWordId,
  onFocusWordConsumed,
  onOpenRelated,
}: LibraryPageProps) {
  const [entries, setEntries] = useState<WordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState<LayoutMode>('grid');
  const [view, setView] = useState<WordView>('words');
  const [filter, setFilter] = useState<ArchiveFilter>('all');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [screen, setScreen] = useState<'library' | 'collection'>('library');
  const [collectionScreen, setCollectionScreen] = useState<CollectionScreen>('cards');
  const [previewLibrary, setPreviewLibrary] = useState<LibrarySummary | null>(null);
  const [previewEntries, setPreviewEntries] = useState<WordEntry[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [draftName, setDraftName] = useState('');
  const [draftGroup, setDraftGroup] = useState('未分组');
  const [editingLibrary, setEditingLibrary] = useState<LibrarySummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibrarySummary | null>(null);
  const [wordEdit, setWordEdit] = useState<WordEntry | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSentences, setEditSentences] = useState('');
  const [editRelationIds, setEditRelationIds] = useState<number[]>([]);
  const [sentenceEdit, setSentenceEdit] = useState<SentenceEdit | null>(null);
  const [sentenceDraft, setSentenceDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [collectionClosing, setCollectionClosing] = useState(false);
  const [collectionReturning, setCollectionReturning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const returnTimer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .listWords(library.id, '', 1000)
      .then((data) => {
        if (active) setEntries(data.items);
      })
      .catch(() => {
        if (active) setError('读取词库失败，请确认本地 API 正在运行。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [library.id, refreshKey]);

  useEffect(() => {
    if (focusWordId === null) return;
    const target = entries.find((word) => word.id === focusWordId);
    if (!target) {
      if (!loading) onFocusWordConsumed();
      return;
    }
    setScreen('library');
    setView('words');
    setFilter('all');
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
      return;
    }
    let active = true;
    setPreviewLoading(true);
    api
      .listWords(previewLibrary.id, '', 1000)
      .then((data) => {
        if (active) setPreviewEntries(data.items);
      })
      .catch(() => {
        if (active) setPreviewEntries([]);
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
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      if (returnTimer.current !== null) window.clearTimeout(returnTimer.current);
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const filteredWords = entries.filter((word) => {
    if (filter === 'active' && word.archived) return false;
    if (filter === 'archived' && !word.archived) return false;
    if (!needle) return true;
    return (
      word.word.toLowerCase().includes(needle) ||
      word.note.toLowerCase().includes(needle) ||
      word.sentences.some((sentence) => sentence.toLowerCase().includes(needle))
    );
  });
  const groups = groupWords(filteredWords);
  const sentenceItems: SentenceItem[] = entries
    .flatMap((word) =>
      word.sentences.map((sentence, index) => ({
        key: `${word.id}-${index}`,
        text: sentence,
        entry: word,
        index,
      })),
    )
    .filter(
      (item) =>
        !needle ||
        item.text.toLowerCase().includes(needle) ||
        item.entry.word.toLowerCase().includes(needle),
    );
  const activePreview = previewLibrary
    ? libraries.find((item) => item.id === previewLibrary.id) ?? previewLibrary
    : null;

  const closeCollection = () => {
    if (collectionClosing) return;
    setCollectionClosing(true);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setScreen('library');
      setCollectionClosing(false);
      setPreviewLibrary(null);
      setCollectionReturning(true);
      if (returnTimer.current !== null) window.clearTimeout(returnTimer.current);
      returnTimer.current = window.setTimeout(() => {
        setCollectionReturning(false);
        returnTimer.current = null;
      }, 460);
      closeTimer.current = null;
    }, 180);
  };

  const chooseLibrary = (target: LibrarySummary) => {
    if (target.id === library.id) {
      closeCollection();
      return;
    }
    if (collectionClosing) return;
    setCollectionClosing(true);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      onSelectLibrary(target.id);
      setScreen('library');
      setCollectionClosing(false);
      setPreviewLibrary(null);
      closeTimer.current = null;
    }, 180);
  };

  const openCreate = () => {
    setEditingLibrary(null);
    setDraftName('');
    setDraftGroup('未分组');
    setDialog('library');
  };

  const openEditLibrary = (target: LibrarySummary) => {
    setEditingLibrary(target);
    setDraftName(target.name);
    setDraftGroup(target.group_name);
    setDialog('library');
  };

  const saveLibrary = async () => {
    const name = draftName.trim();
    if (!name) {
      onToast('请先给词库起一个名字');
      return;
    }
    setSaving(true);
    try {
      if (editingLibrary) {
        const updated = await onUpdateLibrary(editingLibrary.id, name, draftGroup.trim() || '未分组');
        setPreviewLibrary(updated);
        onToast(`已更新「${updated.name}」`);
      } else {
        const created = await onAddLibrary(name, draftGroup.trim() || '未分组');
        setPreviewLibrary(created);
        setCollectionScreen('preview');
        onToast(`已创建「${created.name}」`);
      }
      setDialog(null);
      setEditingLibrary(null);
    } catch (saveError) {
      onToast(saveError instanceof Error ? saveError.message : '词库保存失败。');
    } finally {
      setSaving(false);
    }
  };

  const deleteLibrary = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await onDeleteLibrary(deleteTarget.id);
      onToast(`已删除「${deleteTarget.name}」`);
      setDialog(null);
      setDeleteTarget(null);
      setPreviewLibrary(null);
      setCollectionScreen('cards');
    } catch (deleteError) {
      onToast(deleteError instanceof Error ? deleteError.message : '词库删除失败。');
    } finally {
      setSaving(false);
    }
  };

  const replaceWord = (updated: WordEntry) => {
    setEntries((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  };

  const toggleArchive = async (word: WordEntry) => {
    try {
      const result = word.archived
        ? await api.unarchiveWord(word.id)
        : await api.archiveWord(word.id);
      replaceWord(result.word);
      onToast(word.archived ? `已取消归档「${word.word}」` : `已归档「${word.word}」`);
      onChanged();
    } catch (archiveError) {
      onToast(archiveError instanceof Error ? archiveError.message : '归档失败。');
    }
  };

  const deleteWord = async (word: WordEntry) => {
    if (!window.confirm(`确定删除「${word.word}」吗？删除后无法恢复。`)) return;
    try {
      await api.deleteWord(word.id);
      setEntries((items) => items.filter((item) => item.id !== word.id));
      setExpandedId(null);
      onToast(`已删除「${word.word}」`);
      onChanged();
    } catch (deleteError) {
      onToast(deleteError instanceof Error ? deleteError.message : '删除失败。');
    }
  };

  const openWordEdit = (word: WordEntry) => {
    setWordEdit(word);
    setEditWord(word.word);
    setEditNote(word.note);
    setEditSentences(word.sentences.join('\n'));
    setEditRelationIds(word.related.map((item) => item.id));
    setDialog('word');
  };

  const saveWord = async () => {
    if (!wordEdit) return;
    setSaving(true);
    try {
      const updated = await api.updateWord(wordEdit.id, {
        word: editWord.trim(),
        note: editNote.trim(),
        sentences: editSentences
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        related_ids: editRelationIds,
      });
      replaceWord(updated);
      setDialog(null);
      setWordEdit(null);      onToast(`已更新「${updated.word}」`);
      onChanged();
    } catch (saveError) {
      onToast(saveError instanceof Error ? saveError.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  };

  const openSentenceEdit = (item: SentenceItem) => {
    setSentenceEdit({ entry: item.entry, index: item.index });
    setSentenceDraft(item.text);
    setDialog('sentence');
  };

  const saveSentence = async () => {
    if (!sentenceEdit) return;
    const text = sentenceDraft.trim();
    if (!text) {
      onToast('句子不能为空。');
      return;
    }
    setSaving(true);
    try {
      const sentences = sentenceEdit.entry.sentences.map((sentence, index) =>
        index === sentenceEdit.index ? text : sentence,
      );
      const updated = await api.updateWord(sentenceEdit.entry.id, {
        word: sentenceEdit.entry.word,
        note: sentenceEdit.entry.note,
        sentences,
        related_ids: sentenceEdit.entry.related.map((item) => item.id),
      });
      replaceWord(updated);
      setDialog(null);
      setSentenceEdit(null);
      onToast('句子已更新');
      onChanged();
    } catch (saveError) {
      onToast(saveError instanceof Error ? saveError.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  };

  const deleteSentence = async (item: SentenceItem) => {
    if (!window.confirm('只删除这一句，单词本身会保留。继续吗？')) return;
    try {
      const updated = await api.updateWord(item.entry.id, {
        word: item.entry.word,
        note: item.entry.note,
        sentences: item.entry.sentences.filter((_, index) => index !== item.index),
        related_ids: item.entry.related.map((related) => related.id),
      });
      replaceWord(updated);
      onToast('句子已删除');
      onChanged();
    } catch (deleteError) {
      onToast(deleteError instanceof Error ? deleteError.message : '删除失败。');
    }
  };

  const exportLibrary = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { blob, filename } = await api.exportLibrary(library.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onToast('词库已导出');
      setDialog(null);
    } catch (exportError) {
      onToast(exportError instanceof Error ? exportError.message : '导出失败。');
    } finally {
      setExporting(false);
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      onToast('请选择 SeeEnglish 导出的 JSON 文件。');
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const payload: unknown = JSON.parse(text);
      if (!isLibraryPayload(payload)) throw new Error('这不是 SeeEnglish 导出的词库文件。');
      const result = await api.importLibrary(library.id, payload);
      onToast(`导入完成：新增 ${result.imported}，合并 ${result.merged}`);
      setDialog(null);
      onChanged();
    } catch (importError) {
      onToast(importError instanceof Error ? importError.message : '导入失败。');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const layoutSwitch = (
    <div className="layout-switch" role="group" aria-label="排版">
      <button type="button" className={layout === 'list' ? 'is-active' : ''} title="列表布局" onClick={() => setLayout('list')}>
        <List size={14} strokeWidth={1.9} />
      </button>
      <button type="button" className={layout === 'grid' ? 'is-active' : ''} title="A–Z 栅格布局" onClick={() => setLayout('grid')}>
        <LayoutGrid size={14} strokeWidth={1.9} />
      </button>
    </div>
  );

  if (screen === 'collection') {
    return (
      <section className={`page page--library-collection ${collectionClosing ? 'is-closing' : ''}`}>
        <header className="collection-head">
          <div>
            <div className="eyebrow">
              <span />
              LIBRARY · COLLECTION
            </div>
            <h1>把词，分开放。</h1>
            <p>每个词库有自己的单词、句子、分数和复习记录。选择一个继续，或者为下一个主题再建一个。</p>
          </div>
          <button type="button" className="collection-circle" onClick={closeCollection} disabled={collectionClosing} aria-label="返回当前词库">
            <LibraryBig size={18} strokeWidth={1.8} />
          </button>
        </header>

        {collectionScreen === 'cards' ? (
          <>
            <div className="collection-intro">
              <span>{String(libraries.length).padStart(2, '0')} 个词库 · 默认词库始终保留</span>
              <button type="button" className="button button--primary" onClick={openCreate}>
                <Plus size={15} strokeWidth={2} />
                新增词库
              </button>
            </div>
            <div className="library-card-grid">
              {libraries.map((item) => {
                const isCurrent = item.id === library.id;
                return (
                  <article
                    key={item.id}
                    className={`gui-library-card ${isCurrent ? 'is-current' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setPreviewLibrary(item);
                      setCollectionScreen('preview');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setPreviewLibrary(item);
                        setCollectionScreen('preview');
                      }
                    }}
                  >
                    <div className="gui-library-card__top">
                      <span className="gui-library-card__mark">
                        <LibraryBig size={16} strokeWidth={1.7} />
                      </span>
                      <span className="gui-library-card__group">{item.group_name}</span>
                      {item.is_default && <span className="badge badge--default">默认</span>}
                      {isCurrent && (
                        <span className="badge badge--current">
                          <Check size={9} strokeWidth={2.2} />
                          当前
                        </span>
                      )}
                      {!item.is_default && (
                        <button
                          type="button"
                          className="gui-library-card__delete"
                          aria-label={`删除 ${item.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(item);
                            setDialog('delete');
                          }}
                        >
                          <Trash2 size={12} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                    <h3>{item.name}</h3>
                    <p>{item.is_default ? '默认词库，始终保留。' : '独立保存，独立复习。'}</p>
                    <div className="gui-library-card__stats">
                      <span><b>{item.word_count}</b><small>单词</small></span>
                      <span><b>{item.sentence_count}</b><small>句子</small></span>
                      <span><b>{item.score.toFixed(3)}</b><small>分数</small></span>
                    </div>
                    <span className="gui-library-card__enter">
                      查看内容
                      <ArrowRight size={12} strokeWidth={1.9} />
                    </span>
                  </article>
                );
              })}
              <button type="button" className="gui-library-card gui-library-card--new" onClick={openCreate}>
                <span className="gui-library-card__plus"><Plus size={20} strokeWidth={1.8} /></span>
                <b>新建词库</b>
                <small>给下一个主题留一个位置</small>
              </button>
            </div>
          </>
        ) : (
          activePreview && (
            <div className="collection-preview">
              <button type="button" className="back-link" onClick={() => { setCollectionScreen('cards'); setPreviewLibrary(null); }}>
                <ArrowLeft size={13} strokeWidth={1.8} />
                所有词库
              </button>
              <div className="collection-preview__head panel">
                <span className="collection-cover">
                  <b>{activePreview.name.slice(0, 1).toUpperCase()}</b>
                  <LibraryBig size={16} strokeWidth={1.7} />
                </span>
                <div className="collection-preview__identity">
                  <span className="gui-library-card__group">{activePreview.group_name}</span>
                  <h2>{activePreview.name}</h2>
                  <p>{activePreview.is_default ? '默认词库始终保留，也不能删除。' : '这个词库里的词、句子和复习记录与其他词库互不影响。'}</p>
                </div>
                <div className="collection-preview__actions">
                  <button type="button" className="button button--ghost" onClick={() => openEditLibrary(activePreview)}>
                    <Pencil size={13} strokeWidth={1.8} />
                    编辑
                  </button>
                  <button type="button" className="button button--primary" onClick={() => chooseLibrary(activePreview)}>
                    <Check size={14} strokeWidth={2} />
                    {activePreview.id === library.id ? '回到该词库' : '选择该词库'}
                  </button>
                </div>
              </div>
              <div className="collection-preview__stats">
                <span><b>{activePreview.word_count}</b><small>单词</small></span>
                <span><b>{activePreview.sentence_count}</b><small>句子</small></span>
                <span><b>{activePreview.score.toFixed(3)}</b><small>分数</small></span>
              </div>
              <div className="collection-preview__columns">
                <section className="collection-panel panel">
                  <header><h3>单词</h3><span>{String(previewEntries.length).padStart(2, '0')}</span></header>
                  {previewLoading ? (
                    <div className="collection-loading"><LoaderCircle className="spin" size={17} strokeWidth={1.8} />正在读取…</div>
                  ) : (
                    <div className="collection-word-list">
                      {previewEntries.slice(0, 10).map((word) => (
                        <div key={word.id}>
                          <b>{word.word}</b>
                          <span>{word.note || '还没有联想。'}</span>
                          <small>{word.sentences.length} 句</small>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="collection-panel panel">
                  <header><h3>句子</h3><span>{String(previewEntries.reduce((total, word) => total + word.sentences.length, 0)).padStart(2, '0')}</span></header>
                  <div className="collection-sentence-list">
                    {previewEntries.flatMap((word) => word.sentences.slice(0, 1)).slice(0, 8).map((sentence) => (
                      <p key={sentence}><Quote size={12} strokeWidth={1.7} />{sentence}</p>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )
        )}

        {dialog === 'library' && (
          <Dialog eyebrow={editingLibrary ? 'EDIT LIBRARY' : 'NEW LIBRARY'} title={editingLibrary ? '编辑词库' : '新建词库'} onClose={() => setDialog(null)}>
            <div className="dialog-form">
              <label className="field">
                <span>词库名称</span>
                <input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="例如：考研阅读、电影台词" autoFocus />
              </label>
              <label className="field">
                <span>分组</span>
                <input value={draftGroup} onChange={(event) => setDraftGroup(event.target.value)} placeholder="考试 / 阅读 / 日常" />
                <small>分组只用于整理词库，不会影响单词内容。</small>
              </label>
              <div className="dialog-actions">
                <button type="button" className="button button--ghost" onClick={() => setDialog(null)}>取消</button>
                <button type="button" className="button button--primary" disabled={saving} onClick={() => void saveLibrary()}>
                  {saving ? <LoaderCircle className="spin" size={15} strokeWidth={1.8} /> : <Check size={15} strokeWidth={2} />}
                  {saving ? '保存中…' : editingLibrary ? '保存修改' : '创建词库'}
                </button>
              </div>
            </div>
          </Dialog>
        )}

        {dialog === 'delete' && deleteTarget && (
          <Dialog eyebrow="DELETE LIBRARY" title="删除词库" onClose={() => setDialog(null)}>
            <div className="dialog-form">
              <p className="dialog-copy">确定删除「<b>{deleteTarget.name}</b>」吗？这个词库里的 {deleteTarget.word_count} 个单词和 {deleteTarget.sentence_count} 个句子会一起移除。</p>
              <p className="dialog-warning">删除后无法恢复。默认词库不会出现在这个操作里。</p>
              <div className="dialog-actions">
                <button type="button" className="button button--ghost" onClick={() => setDialog(null)}>取消</button>
                <button type="button" className="button button--danger" disabled={saving} onClick={() => void deleteLibrary()}>
                  <Trash2 size={14} strokeWidth={1.8} />
                  确认删除
                </button>
              </div>
            </div>
          </Dialog>
        )}
      </section>
    );
  }

  return (
    <section className={`page page--library ${collectionReturning ? 'is-returning' : ''}`}>
      {immersive && (
        <div className="immersive-tools">
          <button type="button" className="immersive-tools__icon" title="记一个新词" onClick={() => onNavigate('capture')}>
            <Plus size={15} strokeWidth={1.9} />
          </button>
          <button type="button" className="immersive-tools__icon" title="导出 / 导入" onClick={() => setDialog('transfer')}>
            <ArrowDownUp size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="library-chip" onClick={() => { setScreen('collection'); setCollectionScreen('cards'); }}>
            <LibraryBig size={13} strokeWidth={1.8} />
            选择词库
          </button>
          {layoutSwitch}
        </div>
      )}

      <header className="page-heading page-heading--library">
        <div>
          <div className="eyebrow">
            <span />
            LIBRARY · 03
            <em>{library.name}</em>
          </div>
          <h1>你的语言索引。</h1>
          <p>当前词库「{library.name}」· 每一个词、每一句语境，都只留在这台电脑里。</p>
        </div>
        <div className="page-heading__actions">
          <button type="button" className="button button--outline" onClick={() => setDialog('transfer')}>
            <ArrowDownUp size={15} strokeWidth={1.8} />
            导出 / 导入
          </button>
          <button type="button" className="button button--primary" onClick={() => onNavigate('capture')}>
            <Plus size={15} strokeWidth={2} />
            记一个新词
          </button>
        </div>
      </header>

      <div className="library-stats-row">
        <span><b>{library.word_count}</b> 词条</span>
        <span><b>{library.sentence_count}</b> 例句</span>
        <span><b>{entries.reduce((total, word) => total + word.related.length, 0)}</b> 关联</span>
        <span><b>{entries.reduce((total, word) => total + word.forms.length, 0)}</b> 形态</span>
        <span><b>{library.archived_count}</b> 已归档</span>
      </div>

      <div className="library-toolbar">
        <div className="library-toolbar__left">
          <div className="segmented" role="tablist" aria-label="词库视图">
            <button type="button" role="tab" aria-selected={view === 'words'} className={view === 'words' ? 'is-active' : ''} onClick={() => setView('words')}>
              单词 <span>{String(entries.length).padStart(2, '0')}</span>
            </button>
            <button type="button" role="tab" aria-selected={view === 'sentences'} className={view === 'sentences' ? 'is-active' : ''} onClick={() => setView('sentences')}>
              句子 <span>{String(sentenceItems.length).padStart(2, '0')}</span>
            </button>
          </div>
          {view === 'words' && (
            <div className="gui-filter" role="group" aria-label="按归档状态筛选">
              <span>筛选</span>
              <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>全部</button>
              <button type="button" className={filter === 'active' ? 'is-active' : ''} onClick={() => setFilter('active')}>未归档</button>
              <button type="button" className={filter === 'archived' ? 'is-active' : ''} onClick={() => setFilter('archived')}>已归档</button>
            </div>
          )}
        </div>
        <div className="library-toolbar__right">
          <div className="gui-search">
            <Search size={15} strokeWidth={1.8} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={view === 'words' ? '搜索单词、联想或关联词…' : '搜索例句…'}
              aria-label="搜索词库"
              spellCheck={false}
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X size={13} strokeWidth={2} /></button>}
          </div>
          {!immersive && (
            <>
              <button type="button" className="library-trigger" onClick={() => { setScreen('collection'); setCollectionScreen('cards'); }}>
                <LibraryBig size={14} strokeWidth={1.8} />
                <span>选择词库</span>
              </button>
              {layoutSwitch}
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="library-loading panel"><LoaderCircle className="spin" size={18} strokeWidth={1.8} />正在打开词库…</div>
      ) : error ? (
        <div className="page-alert">{error}</div>
      ) : view === 'words' && (filteredWords.length === 0 ? (
        <div className="empty-state panel">没有找到与当前筛选和搜索匹配的词。</div>
      ) : layout === 'grid' ? (
        <div className="gui-word-groups">
          {groups.map((group) => (
            <section className="gui-word-group" key={group.letter}>
              <header className="gui-word-group__head">
                <b>{group.letter}</b>
                <span />
                <small>{String(group.words.length).padStart(2, '0')} 词</small>
              </header>
              <div className="gui-word-grid">
                {group.words.map((word, index) => (
                  <WordCard
                    key={word.id}
                    word={word}
                    index={index}
                    isOpen={expandedId === word.id}
                    onToggle={() => setExpandedId(expandedId === word.id ? null : word.id)}
                    onEdit={() => openWordEdit(word)}
                    onArchive={() => void toggleArchive(word)}
                    onDelete={() => void deleteWord(word)}
                    onOpenRelated={onOpenRelated}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="gui-word-list">
          {filteredWords.map((word, index) => (
            <WordCard
              key={word.id}
              word={word}
              index={index}
              isOpen={expandedId === word.id}
              onToggle={() => setExpandedId(expandedId === word.id ? null : word.id)}
              onEdit={() => openWordEdit(word)}
              onArchive={() => void toggleArchive(word)}
              onDelete={() => void deleteWord(word)}
              onOpenRelated={onOpenRelated}
            />
          ))}
        </div>
      ))}

      {!loading && !error && view === 'sentences' && (
        <div className="gui-sentence-list">
          {sentenceItems.length === 0 ? (
            <div className="empty-state panel">没有找到匹配的句子。</div>
          ) : (
            sentenceItems.map((sentence) => (
              <article className="gui-sentence-card panel" key={sentence.key}>
                <span className="gui-sentence-card__quote"><Quote size={16} strokeWidth={1.7} /></span>
                <p>{sentence.text}</p>
                <footer>
                  <span>from <b>{sentence.entry.word}</b></span>
                  {sentence.entry.archived && <span className="badge badge--default">已归档</span>}
                  <button type="button" className="text-link text-link--muted" onClick={() => openSentenceEdit(sentence)}>
                    <Pencil size={12} strokeWidth={1.8} />编辑
                  </button>
                  <button type="button" className="text-link text-link--muted" onClick={() => void deleteSentence(sentence)}>
                    <Trash2 size={12} strokeWidth={1.8} />删除
                  </button>
                </footer>
              </article>
            ))
          )}
        </div>
      )}

      {dialog === 'transfer' && (
        <Dialog eyebrow="LIBRARY · TRANSFER" title="导出 / 导入词库" onClose={() => setDialog(null)} wide>
          <p className="dialog-copy">把「{library.name}」带走，或者把一份之前的备份合并进这个词库。</p>
          <div className="transfer-options">
            <button type="button" onClick={() => void exportLibrary()} disabled={exporting}>
              <span><Download size={19} strokeWidth={1.6} /></span>
              <div><b>{exporting ? '正在导出…' : '导出词库'}</b><small>下载完整 JSON 备份，包含复习和归档状态</small></div>
              <ArrowRight size={14} strokeWidth={1.8} />
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              <span><Upload size={19} strokeWidth={1.6} /></span>
              <div><b>{importing ? '正在导入…' : '导入词库'}</b><small>选择一份之前导出的 JSON 文件</small></div>
              <ArrowRight size={14} strokeWidth={1.8} />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void importFile(file);
            }}
          />
          <div className="import-dropzone" onClick={() => fileInputRef.current?.click()}>
            <Upload size={23} strokeWidth={1.5} />
            <b>拖拽或点击选择 JSON</b>
            <small>只导入到当前词库</small>
          </div>
          <p className="dialog-hint">只接受 SeeEnglish 导出的 `seeenglish.library` v1 JSON。</p>
        </Dialog>
      )}

      {dialog === 'word' && wordEdit && (
        <Dialog eyebrow="EDIT ENTRY" title="修改词条" onClose={() => setDialog(null)}>
          <div className="dialog-form">
            <label className="field"><span>单词</span><input value={editWord} onChange={(event) => setEditWord(event.target.value)} /></label>
            <label className="field"><span>个人联想</span><textarea value={editNote} onChange={(event) => setEditNote(event.target.value)} rows={4} /></label>
            <label className="field"><span>例句</span><textarea value={editSentences} onChange={(event) => setEditSentences(event.target.value)} rows={5} /><small>每行保存为一句。</small></label>
            <div className="library-edit-relations">
              <span className="field-label">关联词</span>
              <div className="relation-row">
                {editRelationIds.map((id) => {
                  const related = entries.find((item) => item.id === id);
                  if (!related) return null;
                  return (
                    <span className="relation-tag" key={id}>
                      {related.word}
                      <button
                        type="button"
                        onClick={() => setEditRelationIds((items) => items.filter((item) => item !== id))}
                        aria-label={`移除关联词 ${related.word}`}
                      >
                        <X size={11} strokeWidth={2} />
                      </button>
                    </span>
                  );
                })}
                <select
                  className="relation-select"
                  value=""
                  onChange={(event) => {
                    const id = Number(event.target.value);
                    if (id) setEditRelationIds((items) => [...items, id]);
                  }}
                  aria-label="添加关联词"
                >
                  <option value="">＋ 关联一个词</option>
                  {entries
                    .filter((item) => item.id !== wordEdit.id && !editRelationIds.includes(item.id))
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.word}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="dialog-actions">
              <button type="button" className="button button--ghost" onClick={() => setDialog(null)}>取消</button>
              <button type="button" className="button button--primary" disabled={saving} onClick={() => void saveWord()}>
                {saving ? <LoaderCircle className="spin" size={15} strokeWidth={1.8} /> : <Check size={15} strokeWidth={2} />}
                {saving ? '保存中…' : '保存修改'}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {dialog === 'sentence' && sentenceEdit && (
        <Dialog eyebrow="EDIT SENTENCE" title="修改句子" onClose={() => setDialog(null)}>
          <div className="dialog-form">
            <label className="field"><span>句子内容</span><textarea value={sentenceDraft} onChange={(event) => setSentenceDraft(event.target.value)} rows={6} autoFocus /></label>
            <div className="dialog-actions">
              <button type="button" className="button button--ghost" onClick={() => setDialog(null)}>取消</button>
              <button type="button" className="button button--primary" disabled={saving} onClick={() => void saveSentence()}>
                {saving ? <LoaderCircle className="spin" size={15} strokeWidth={1.8} /> : <Check size={15} strokeWidth={2} />}
                {saving ? '保存中…' : '保存句子'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
