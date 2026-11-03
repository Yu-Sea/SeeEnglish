import {
  ArrowRight,
  BookOpen,
  Check,
  CornerDownLeft,
  LibraryBig,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import type { LibrarySummary, WordEntry, WordMatch } from '../api';

interface CapturePageProps {
  library: LibrarySummary;
  refreshKey: number;
  immersive: boolean;
  onNavigate: (page: 'capture' | 'review' | 'library' | 'profile') => void;
  onChanged: () => void;
  onToast: (message: string) => void;
}

function matchLabel(match: WordMatch): string {
  return match.relation_label || '词库结果';
}

export function CapturePage({
  library,
  refreshKey,
  immersive,
  onNavigate,
  onChanged,
  onToast,
}: CapturePageProps) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<WordMatch[]>([]);
  const [selected, setSelected] = useState<WordMatch | null>(null);
  const [composer, setComposer] = useState(false);
  const [matching, setMatching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [allWords, setAllWords] = useState<WordEntry[]>([]);
  const [recent, setRecent] = useState<WordEntry[]>([]);
  const [sentence, setSentence] = useState('');
  const [note, setNote] = useState('');
  const [relations, setRelations] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .listWords(library.id, '', 1000)
      .then((data) => {
        if (!active) return;
        setAllWords(data.items);
        setRecent(data.items.slice(0, 4));
      })
      .catch(() => {
        if (active) setRecent([]);
      });
    return () => {
      active = false;
    };
  }, [library.id, refreshKey]);

  useEffect(() => {
    const trimmed = query.trim();
    if (composer || !trimmed) {
      setMatching(false);
      if (!trimmed) setMatches([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setMatching(true);
      setSearchError('');
      api
        .match(library.id, trimmed)
        .then((data) => {
          if (active) setMatches(data.matches);
        })
        .catch(() => {
          if (active) {
            setMatches([]);
            setSearchError('搜索暂时不可用。');
          }
        })
        .finally(() => {
          if (active) setMatching(false);
        });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [composer, library.id, query]);

  const relationWords = useMemo(
    () => allWords.filter((word) => !relations.includes(word.id)).slice(0, 5),
    [allWords, relations],
  );

  const openComposer = (match?: WordMatch) => {
    setComposer(true);
    setSelected(match ?? null);
    setSaveError('');
    if (match) {
      setQuery(match.word);
      setNote(match.note);
      setSentence(match.sentences[0] ?? '');
      setRelations(match.related.map((item) => item.id));
    } else {
      setNote('');
      setSentence('');
      setRelations([]);
    }
  };

  const closeComposer = () => {
    setComposer(false);
    setSelected(null);
    setSaveError('');
    setSentence('');
    setNote('');
    setRelations([]);
  };

  const openSearchComposer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;
    openComposer(selected ?? undefined);
  };

  const save = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (saving) return;
    const word = (selected?.word ?? query).trim();
    if (!word) return;
    setSaving(true);
    setSaveError('');
    try {
      if (selected) {
        await api.supplementWord(selected.id, {
          sentence: sentence.trim(),
          note: note.trim(),
          related_ids: relations,
          source_form:
            query.trim() && query.trim().toLowerCase() !== selected.word.toLowerCase()
              ? query.trim()
              : undefined,
        });
        onToast(`已补充「${selected.word}」`);
      } else {
        await api.createWord(library.id, {
          word,
          sentence: sentence.trim(),
          note: note.trim(),
          related_ids: relations,
        });
        onToast(`已收录「${word}」`);
      }
      closeComposer();
      setQuery('');
      onChanged();
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : null;
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        detail &&
        typeof detail !== 'string' &&
        detail.entry_id
      ) {
        try {
          const existing = await api.listWords(library.id, '', 1000);
          const target = existing.items.find((item) => item.id === detail.entry_id);
          if (target) {
            const match: WordMatch = {
              ...target,
              match_type: 'exact',
              relation_label: '完全匹配',
              matched_form: target.word,
            };
            openComposer(match);
            setSaveError('这个词已经存在，已切换到补充模式。');
            return;
          }
        } catch {
          // Fall through to the normal error.
        }
      }
      setSaveError(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page page--capture">
      {immersive && (
        <div className="immersive-tools">
          <button type="button" className="library-chip" onClick={() => onNavigate('library')}>
            <LibraryBig size={13} strokeWidth={1.8} />
            {library.name}
          </button>
          <button type="button" className="immersive-tools__icon" onClick={() => onNavigate('review')} title="去复习">
            <BookOpen size={15} strokeWidth={1.8} />
          </button>
        </div>
      )}

      <header className="page-heading">
        <div>
          <div className="eyebrow">
            <span />
            CAPTURE · 01
          </div>
          <h1>今天，记一个词。</h1>
          <p>输入遇见的词，留下它出现的地方，再写下只属于你的理解。</p>
        </div>
        <div className="page-heading__actions">
          <button type="button" className="library-chip" onClick={() => onNavigate('library')}>
            <LibraryBig size={14} strokeWidth={1.8} />
            {library.name}
            <ArrowRight size={12} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      <div className="capture-layout">
        <div className="capture-main">
          <form className="capture-search panel" onSubmit={openSearchComposer}>
            <div className="capture-search__field">
              <Search size={20} strokeWidth={1.7} />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(null);
                  setComposer(false);
                }}
                placeholder="输入一个单词，建立你的索引…"
                aria-label="输入英语单词"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSelected(null);
                    setComposer(false);
                    setMatches([]);
                  }}
                  aria-label="清空输入"
                >
                  <X size={15} strokeWidth={2} />
                </button>
              )}
              <button
                type="submit"
                className="capture-search__submit"
                disabled={!query.trim() && !selected}
              >
                {selected ? <Check size={16} strokeWidth={2} /> : <Plus size={16} strokeWidth={2} />}
                {selected ? '保存' : '记词'}
              </button>
            </div>
            <div className="capture-search__meta">
              <span>
                <CornerDownLeft size={11} strokeWidth={1.8} />
                Enter 继续
              </span>
              <span>{matching ? '正在匹配…' : '支持复数、过去式与不规则形态'}</span>
            </div>
          </form>

          {composer ? (
            <form className="composer panel" onSubmit={save}>
              <div className="composer-head">
                <div>
                  <span className="panel-kicker">
                    {selected ? 'SUPPLEMENT · 补充' : 'NEW ENTRY · 新词条'}
                  </span>
                  <h2>{selected?.word ?? query}</h2>
                  <p>{selected?.note || '给它留下一个只属于你的入口。'}</p>
                </div>
                <span className={`composer-badge ${selected ? 'is-existing' : ''}`}>
                  {selected ? '已存在于词库' : '新索引'}
                </span>
              </div>

              <div className="composer-fields">
                <label className="field">
                  <span>它出现的句子</span>
                  <textarea
                    value={sentence}
                    onChange={(event) => setSentence(event.target.value)}
                    rows={3}
                    placeholder="写下你第一次遇见它的那句话…"
                  />
                </label>
                <label className="field">
                  <span>你的联想</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="中文释义、词根、画面感……"
                  />
                </label>
              </div>

              <div className="composer-relations">
                <div className="field-label">
                  <span>关联词</span>
                  <small>把相近或相反的记忆放在一起</small>
                </div>
                <div className="relation-row">
                  {relations.map((id) => {
                    const word = allWords.find((item) => item.id === id);
                    if (!word) return null;
                    return (
                      <span className="relation-tag" key={id}>
                        {word.word}
                        <button
                          type="button"
                          onClick={() =>
                            setRelations((items) => items.filter((item) => item !== id))
                          }
                          aria-label={`移除关联词 ${word.word}`}
                        >
                          <X size={11} strokeWidth={2} />
                        </button>
                      </span>
                    );
                  })}
                  {relationWords.length > 0 && (
                    <select
                      className="relation-select"
                      value=""
                      onChange={(event) => {
                        const id = Number(event.target.value);
                        if (id) setRelations((items) => [...items, id]);
                      }}
                      aria-label="添加关联词"
                    >
                      <option value="">＋ 关联一个词</option>
                      {relationWords.map((word) => (
                        <option value={word.id} key={word.id}>
                          {word.word}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {saveError && <p className="inline-error">{saveError}</p>}

              <div className="composer-actions">
                <button type="button" className="button button--ghost" onClick={closeComposer}>
                  取消
                </button>
                <button type="submit" className="button button--primary" disabled={saving}>
                  {saving ? (
                    <LoaderCircle className="spin" size={15} strokeWidth={1.8} />
                  ) : (
                    <Check size={16} strokeWidth={2} />
                  )}
                  {saving ? '保存中…' : selected ? '补充到词条' : '保存到词库'}
                </button>
              </div>
            </form>
          ) : (
            <div className="match-panel panel">
              <div className="panel-head">
                <div>
                  <span className="panel-kicker">{query.trim() ? 'MATCHES' : 'RECENT'}</span>
                  <h2>{query.trim() ? '词库里的匹配结果' : '最近收录'}</h2>
                </div>
                <span className="panel-count">
                  {String(query.trim() ? matches.length : recent.length).padStart(2, '0')}
                </span>
              </div>

              {query.trim() ? (
                <>
                  {matches.length === 0 && !matching ? (
                    <div className="match-empty">
                      <p>词库里还没有「{query.trim()}」的匹配。</p>
                      <button type="button" className="button button--primary" onClick={() => openComposer()}>
                        <Plus size={15} strokeWidth={2} />
                        作为新词收录
                      </button>
                    </div>
                  ) : (
                    <div className="match-list">
                      {matches.map((match) => (
                        <button
                          type="button"
                          className="match-row"
                          key={match.id}
                          onClick={() => openComposer(match)}
                        >
                          <span className={`match-type match-type--${match.match_type}`}>
                            {matchLabel(match)}
                          </span>
                          <span className="match-row__word">{match.word}</span>
                          <span className="match-row__note">{match.note || match.sentences[0] || '还没有联想。'}</span>
                          <ArrowRight size={14} strokeWidth={1.8} />
                        </button>
                      ))}
                    </div>
                  )}
                  {searchError && <p className="inline-error">{searchError}</p>}
                  {matches.length > 0 && (
                    <div className="match-panel__foot">
                      <span>选中一个词补充，或为当前输入建立新索引。</span>
                      <button type="button" onClick={() => openComposer()}>
                        新建独立词条
                        <ArrowRight size={13} strokeWidth={1.8} />
                      </button>
                    </div>
                  )}
                </>
              ) : recent.length === 0 ? (
                <div className="match-empty">
                  <p>这个词库还没有词。输入一个开始吧。</p>
                </div>
              ) : (
                <div className="recent-list recent-list--wide">
                  {recent.map((word) => (
                    <button
                      type="button"
                      key={word.id}
                      onClick={() =>
                        openComposer({
                          ...word,
                          match_type: 'exact',
                          relation_label: '完全匹配',
                          matched_form: word.word,
                        })
                      }
                    >
                      <span>{word.word}</span>
                      <small>{word.note || word.sentences[0] || '还没有联想。'}</small>
                      <Link2 size={12} strokeWidth={1.7} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="capture-side">
          <div className="side-card side-card--library panel">
            <div className="panel-head panel-head--tight">
              <div>
                <span className="panel-kicker">CURRENT LIBRARY</span>
                <h2>{library.name}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => onNavigate('library')} aria-label="打开词库">
                <ArrowRight size={15} strokeWidth={1.8} />
              </button>
            </div>
            <div className="library-mini-stats">
              <span>
                <b>{library.word_count}</b>
                单词
              </span>
              <span>
                <b>{library.sentence_count}</b>
                句子
              </span>
              <span>
                <b>{library.score.toFixed(3)}</b>
                分数
              </span>
            </div>
            <button type="button" className="side-link" onClick={() => onNavigate('library')}>
              查看全部词条
              <ArrowRight size={13} strokeWidth={1.8} />
            </button>
          </div>

          <div className="side-card side-card--note panel">
            <span className="side-card__mark">
              <Sparkles size={16} strokeWidth={1.7} />
            </span>
            <span className="panel-kicker">A SMALL NOTE</span>
            <h3>没有每日目标，也没有“今天还差几个”。</h3>
            <p>想记的时候再记。词库会记得你来过，也会把语境一起留下。</p>
            <div className="note-rule" />
            <span className="note-sig">— 见词</span>
            <button type="button" className="side-link side-link--review" onClick={() => onNavigate('review')}>
              去复习一个词
              <ArrowRight size={13} strokeWidth={1.8} />
            </button>
          </div>

          <div className="side-card panel">
            <div className="panel-head panel-head--tight">
              <div>
                <span className="panel-kicker">RECENT</span>
                <h2>最近收录</h2>
              </div>
              <BookOpen size={15} strokeWidth={1.7} />
            </div>
            <div className="recent-list">
              {recent.slice(0, 3).map((word) => (
                <button
                  type="button"
                  key={word.id}
                  onClick={() =>
                    openComposer({
                      ...word,
                      match_type: 'exact',
                      relation_label: '完全匹配',
                      matched_form: word.word,
                    })
                  }
                >
                  <span>{word.word}</span>
                  <small>{word.note || word.sentences[0] || '还没有联想。'}</small>
                  <Link2 size={12} strokeWidth={1.7} />
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
