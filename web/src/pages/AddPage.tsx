import {
  ArrowRight,
  ArrowUpRight,
  Check,
  LoaderCircle,
  Plus,
  Save,
  Search,
  X,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { RelatedWord, TabId, WordEntry, WordMatch } from '../types';
import { MatchPanel } from '../components/MatchPanel';
import { RelationPicker } from '../components/RelationPicker';

type Phase = 'idle' | 'composing' | 'saved';
type ComposerMode = 'new' | 'supplement';

interface AddPageProps {
  libraryId: number;
  libraryName: string;
  onSaved: (entry: WordEntry) => void;
  onNavigate: (tab: TabId) => void;
}

function normalized(value: string): string {
  return value.replace(/’/g, "'").trim().toLowerCase().replace(/\s+/g, ' ');
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return '保存失败，请稍后再试。';
}

export function AddPage({ libraryId, libraryName, onSaved, onNavigate }: AddPageProps) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<WordMatch[]>([]);
  const [selected, setSelected] = useState<WordMatch | null>(null);
  const [pendingForm, setPendingForm] = useState('');
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState('');

  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<ComposerMode>('new');
  const [target, setTarget] = useState<WordEntry | null>(null);
  const [sourceForm, setSourceForm] = useState('');

  const [sentence, setSentence] = useState('');
  const [note, setNote] = useState('');
  const [relations, setRelations] = useState<RelatedWord[]>([]);
  const [allWords, setAllWords] = useState<WordEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedEntry, setSavedEntry] = useState<WordEntry | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const loadWords = useCallback(async () => {
    try {
      const data = await api.listWords('', 1000, libraryId);
      setAllWords(data.items);
    } catch {
      // The relation picker simply stays empty when the local API is offline.
    }
  }, [libraryId]);

  useEffect(() => {
    void loadWords();
  }, [loadWords]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        phase === 'idle' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase]);

  useEffect(() => {
    const trimmed = query.trim();
    if (phase !== 'idle' || !trimmed) {
      setMatching(false);
      if (!trimmed) {
        setMatches([]);
        setSelected(null);
      }
      return;
    }

    let active = true;
    const controller = new AbortController();
    setMatching(true);
    setMatchError('');

    const timer = window.setTimeout(async () => {
      try {
        const data = await api.match(trimmed, libraryId, controller.signal);
        if (!active) return;
        setMatches(data.matches);
        const exact =
          data.matches.find(
            (match) => match.match_type === 'exact' || match.match_type === 'stored',
          ) ?? null;
        setSelected(exact);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setMatches([]);
        setSelected(null);
        setMatchError(errorMessage(error));
      } finally {
        if (active) setMatching(false);
      }
    }, 160);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, phase, libraryId]);

  useEffect(() => {
    if (phase !== 'idle') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [phase]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelected(null);
    setPendingForm('');
    setMatches([]);
    setMatchError('');
  };

  const chooseMatch = (match: WordMatch) => {
    const original = query.trim();
    const isSoft = match.match_type === 'derived' || match.match_type === 'related';
    setQuery(match.word);
    setSelected(match);
    setPendingForm(isSoft && normalized(original) !== normalized(match.word) ? original : '');
    setMatches([]);
    setMatchError('');
    inputRef.current?.focus();
  };

  const openComposer = () => {
    const trimmed = query.trim();
    if (!trimmed || phase !== 'idle' || matching) return;

    const isSupplement = selected !== null;
    const source = isSupplement
      ? pendingForm ||
        (normalized(trimmed) !== normalized(selected?.word ?? '') ? trimmed : '')
      : '';

    setMode(isSupplement ? 'supplement' : 'new');
    setTarget(selected ?? null);
    setSourceForm(source);
    setSentence('');
    setNote('');
    setRelations([]);
    setSaveError('');
    setSavedEntry(null);
    setPhase('composing');
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openComposer();
  };

  const resetToIdle = () => {
    setPhase('idle');
    setMode('new');
    setTarget(null);
    setSourceForm('');
    setSavedEntry(null);
    setSelected(null);
    setMatches([]);
    setPendingForm('');
    setSentence('');
    setNote('');
    setRelations([]);
    setSaveError('');
    setQuery('');
    window.setTimeout(() => inputRef.current?.focus(), 420);
  };

  const cancelComposer = () => {
    setPhase('idle');
    setTarget(null);
    setMode('new');
    setSourceForm('');
    setSelected(null);
    setPendingForm('');
    setSentence('');
    setNote('');
    setRelations([]);
    setSaveError('');
    window.setTimeout(() => inputRef.current?.focus(), 360);
  };

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const word = query.trim();
    if (!word) return;

    setSaving(true);
    setSaveError('');
    const payload = {
      sentence: sentence.trim(),
      note: note.trim(),
      related_ids: relations.map((item) => item.id),
    };

    try {
      let entry: WordEntry;
      if (mode === 'supplement' && target) {
        entry = await api.supplementWord(target.id, {
          ...payload,
          source_form: sourceForm || undefined,
        });
      } else {
        entry = await api.createWord(
          {
            ...payload,
            word,
            source_form: sourceForm || undefined,
          },
          libraryId,
        );
      }
      setSavedEntry(entry);
      setPhase('saved');
      onSaved(entry);
      void loadWords();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.detail &&
        typeof error.detail !== 'string' &&
        error.detail.entry_id
      ) {
        try {
          const existing = await api.getWord(error.detail.entry_id);
          setMode('supplement');
          setTarget(existing);
          setQuery(existing.word);
          setSaveError('这个词已经存在，已切换为补充模式。再点一次保存即可。');
          void loadWords();
        } catch {
          setSaveError(error.message);
        }
      } else {
        setSaveError(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const addRelation = (word: RelatedWord) => {
    setRelations((current) =>
      current.some((item) => item.id === word.id) ? current : [...current, word],
    );
  };

  const removeRelation = (id: number) => {
    setRelations((current) => current.filter((item) => item.id !== id));
  };

  const label =
    phase === 'saved'
      ? '已收录'
      : phase === 'composing'
        ? mode === 'supplement'
          ? '补充中'
          : '记录中'
        : selected
          ? '补充'
          : '记词';

  const canSubmit = phase === 'idle' && query.trim().length > 0 && !matching;
  const actionIcon =
    phase === 'saved' || phase === 'composing' ? (
      <Check size={18} strokeWidth={2} />
    ) : selected ? (
      <ArrowUpRight size={18} strokeWidth={2} />
    ) : (
      <Plus size={18} strokeWidth={2} />
    );

  return (
    <section className={`add-page ${phase === 'idle' ? 'is-idle' : 'is-composing'}`}>
      <div className="add-page__inner">
        <div className={`hero ${phase !== 'idle' ? 'is-hidden' : ''}`} aria-hidden={phase !== 'idle'}>
          <div className="eyebrow hero__eyebrow">
            <span className="eyebrow__line" />
            VOCABULARY · 01
          </div>
          <h1 className="hero__title">
            今天，记一个词<span className="hero__period">。</span>
          </h1>
          <p className="hero__copy">
            输入你遇见的单词，留下它出现的句子，再写下只属于你的理解。
          </p>
          <p className="hero__library">
            <span aria-hidden="true" />
            当前词库 · {libraryName}
          </p>
          <div className="hero__rule">
            <span />
            <span className="hero__rule-text">CAPTURE THE CONTEXT</span>
            <span />
          </div>
        </div>

        <div className={`search-zone ${phase !== 'idle' ? 'is-raised' : ''}`}>
          <form className="search-bar" onSubmit={handleSearchSubmit}>
            <div className="search-field">
              <Search className="search-field__icon" size={20} strokeWidth={1.7} aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Tab' &&
                    matches[0] &&
                    (matches[0].match_type === 'derived' || matches[0].match_type === 'related')
                  ) {
                    event.preventDefault();
                    chooseMatch(matches[0]);
                  }
                }}
                readOnly={phase !== 'idle'}
                placeholder={phase === 'saved' ? '已保存' : '输入一个单词，建立你的索引…'}
                aria-label="输入英语单词"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {matching && (
                <span className="search-field__loading" aria-label="正在匹配">
                  <span />
                  <span />
                  <span />
                </span>
              )}
              {!matching && phase === 'idle' && query && (
                <button
                  type="button"
                  className="search-field__clear"
                  onClick={() => handleQueryChange('')}
                  aria-label="清空输入"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              )}
              {phase === 'idle' && !query && <kbd className="search-field__kbd">/</kbd>}
            </div>

            <button
              type="submit"
              className={`capture-button ${selected ? 'is-supplement' : ''}`}
              disabled={!canSubmit}
              aria-label={
                selected ? `补充已有词条 ${selected.word}` : '为当前单词建立索引'
              }
            >
              {actionIcon}
              <span>{label}</span>
            </button>
          </form>

          <MatchPanel
            query={query}
            matches={matches}
            selectedId={selected?.id ?? null}
            loading={matching}
            onChoose={chooseMatch}
          />

          {phase === 'idle' && !query && (
            <p className="search-caption">
              支持复数、过去式与不规则形态 · 按 <kbd>/</kbd> 聚焦
            </p>
          )}
          {phase === 'idle' && matchError && (
            <p className="search-error" role="alert">
              {matchError}
            </p>
          )}
        </div>

        {phase === 'composing' && (
          <div className="composer-wrap">
            <div className="composer-intro">
              <span className="eyebrow">
                <span className={`pulse-dot ${mode === 'supplement' ? 'is-warm' : ''}`} />
                {mode === 'supplement' ? 'UPDATE EXISTING INDEX' : 'CREATE A NEW INDEX'}
              </span>
              <p>
                {mode === 'supplement'
                  ? `为「${target?.word ?? query}」补充新的语境、关联或理解。`
                  : '把遇见的语境一起留下，记忆才有落点。'}
              </p>
            </div>

            <form className="composer-card glass" onSubmit={saveEntry}>
              <header className="composer-head">
                <div className="composer-head__word">
                  <span className="composer-word">{target?.word ?? query.trim()}</span>
                  <span className="composer-badge">
                    {mode === 'supplement' ? '已有词条' : '新词条'}
                  </span>
                </div>
                <div className="composer-head__meta">
                  {mode === 'supplement' && target ? (
                    <>
                      <span>{String(target.sentences.length).padStart(2, '0')} 句</span>
                      <span>{String(target.related.length).padStart(2, '0')} 关联</span>
                      <span>{String(target.forms.length).padStart(2, '0')} 形态</span>
                    </>
                  ) : (
                    <span>01 · INDEX</span>
                  )}
                </div>
              </header>

              <label className="field field--full">
                <span className="field__label">
                  <span className="field__index">01</span>
                  例句
                  <em>可选</em>
                </span>
                <textarea
                  value={sentence}
                  onChange={(event) => setSentence(event.target.value)}
                  placeholder="写下你遇见它的那句话……"
                  rows={2}
                  maxLength={2000}
                />
                <span className="field__hint">原文、台词，或者你自己造的一句。</span>
              </label>

              <div className="composer-grid">
                <div className="field">
                  <span className="field__label">
                    <span className="field__index">02</span>
                    关联已有单词
                  </span>
                  <RelationPicker
                    words={allWords}
                    selected={relations}
                    targetId={target?.id}
                    onAdd={addRelation}
                    onRemove={removeRelation}
                  />
                  <span className="field__hint">复习时，它们会一起出现。</span>
                </div>

                <label className="field field--note">
                  <span className="field__label">
                    <span className="field__index">03</span>
                    个人联想
                  </span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="中文释义、词根、画面感、容易混淆的词……中英文都可以。"
                    rows={5}
                    maxLength={5000}
                  />
                  <span className="field__hint">中文翻译直接写在这里，保存时不用再填一次。</span>
                </label>
              </div>

              {saveError && (
                <div className="form-alert" role="alert">
                  {saveError}
                </div>
              )}

              <footer className="composer-actions">
                <p className="composer-actions__note">
                  <span className="local-dot" />
                  私密 · 只保存在这台电脑
                </p>
                <div className="composer-actions__buttons">
                  <button type="button" className="button button--ghost" onClick={cancelComposer}>
                    取消
                  </button>
                  <button type="submit" className="button button--primary" disabled={saving}>
                    {saving ? (
                      <LoaderCircle className="spin" size={17} strokeWidth={1.9} />
                    ) : (
                      <Save size={17} strokeWidth={1.9} />
                    )}
                    {saving
                      ? '保存中…'
                      : mode === 'supplement'
                        ? '补充到词条'
                        : '记入词库'}
                  </button>
                </div>
              </footer>
            </form>
          </div>
        )}

        {phase === 'saved' && savedEntry && (
          <div className="save-success glass" aria-live="polite">
            <div className="save-success__mark">
              <Check size={28} strokeWidth={1.7} />
            </div>
            <span className="eyebrow">SAVED TO YOUR LOCAL INDEX</span>
            <h2 className="save-success__word">{savedEntry.word}</h2>
            <p className="save-success__copy">
              {mode === 'supplement'
                ? '新的语境已经补充进这个词条。'
                : '它已经进入你的语言索引，等待下一次重逢。'}
            </p>
            <div className="save-success__meta">
              <span>
                <b>{String(savedEntry.sentences.length).padStart(2, '0')}</b> 例句
              </span>
              <span>
                <b>{String(savedEntry.related.length).padStart(2, '0')}</b> 关联
              </span>
              <span>
                <b>{String(savedEntry.forms.length).padStart(2, '0')}</b> 记录形态
              </span>
            </div>
            <div className="save-success__actions">
              <button type="button" className="button button--ghost" onClick={resetToIdle}>
                再记一个
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => onNavigate('library')}
              >
                查看词库
                <ArrowRight size={17} strokeWidth={1.9} />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
