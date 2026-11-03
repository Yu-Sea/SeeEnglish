import {
  Archive,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Link2,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Target,
  TimerOff,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { GlobalOverview, LibrarySummary, WordEntry } from '../api';

interface ReviewPageProps {
  library: LibrarySummary;
  immersive: boolean;
  onNavigate: (page: 'capture' | 'review' | 'library' | 'profile') => void;
  onChanged: () => void;
  onToast: (message: string) => void;
  onOpenRelated: (wordId: number) => void;
}

type ReviewMode = 'self' | 'ai';
type ReviewStage = 'loading' | 'prompt' | 'reveal' | 'result' | 'empty' | 'error';

export function ReviewPage({
  library,
  immersive,
  onNavigate,
  onChanged,
  onToast,
  onOpenRelated,
}: ReviewPageProps) {
  const [mode, setMode] = useState<ReviewMode>('self');
  const [stage, setStage] = useState<ReviewStage>('loading');
  const [word, setWord] = useState<WordEntry | null>(null);
  const [overview, setOverview] = useState<GlobalOverview | null>(null);
  const [poolSize, setPoolSize] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [aiTab, setAiTab] = useState<'train' | 'explore'>('train');
  const [archiving, setArchiving] = useState(false);

  const loadNext = useCallback(
    async (excludeId?: number) => {
      setStage('loading');
      setWord(null);
      setAnswer('');
      setError('');
      try {
        const data = await api.reviewNext(library.id, excludeId);
        setWord(data.word);
        setOverview(data.overview);
        setPoolSize(data.pool_size);
        setStage('prompt');
      } catch (nextError) {
        if (nextError instanceof ApiError && nextError.status === 404) {
          try {
            setOverview(await api.reviewOverview(library.id));
          } catch {
            // Keep the last overview if the API is unavailable.
          }
          setPoolSize(0);
          setStage('empty');
          return;
        }
        setError(nextError instanceof Error ? nextError.message : '读取复习词失败。');
        setStage('error');
      }
    },
    [library.id],
  );

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  const assess = async (result: 'correct' | 'incorrect') => {
    if (!word || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await api.reviewWord(word.id, { result, answer: answer.trim() });
      setWord(data.word);
      setOverview(data.overview);
      setStage('result');
      onChanged();
    } catch (assessError) {
      setError(assessError instanceof Error ? assessError.message : '提交复习失败。');
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async () => {
    if (!word || archiving) return;
    setArchiving(true);
    setError('');
    try {
      const data = await api.archiveWord(word.id);
      setWord(data.word);
      setOverview(data.overview);
      setStage('result');
      setPoolSize((value) => Math.max(0, value - 1));
      onToast(`已归档「${word.word}」`);
      onChanged();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : '归档失败。');
    } finally {
      setArchiving(false);
    }
  };

  const trend = overview?.trend.slice(-14) ?? [];
  const maxTrend = Math.max(0.02, ...trend.map((point) => Math.abs(point.delta)));
  const blockProgress = word?.block_reviews ?? 0;
  const score = overview?.score ?? library.score;

  const modeSwitch = (
    <div className="review-mode-switch" role="tablist" aria-label="复习方式">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'self'}
        className={mode === 'self' ? 'is-active' : ''}
        onClick={() => setMode('self')}
      >
        <BookOpen size={14} strokeWidth={1.8} />
        自主
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'ai'}
        className={mode === 'ai' ? 'is-active' : ''}
        onClick={() => setMode('ai')}
      >
        <Sparkles size={14} strokeWidth={1.8} />
        AI
      </button>
    </div>
  );

  return (
    <section className="page page--review">
      {immersive && <div className="immersive-tools">{modeSwitch}</div>}

      <header className="page-heading">
        <div>
          <div className="eyebrow">
            <span />
            REVIEW · 02
          </div>
          <h1>让记忆，再回来一次。</h1>
          <p>没有每日任务，也没有连续打卡。随机遇见一个词，再决定这次算不算想起来。</p>
        </div>
        <div className="page-heading__actions">{modeSwitch}</div>
      </header>

      {mode === 'ai' ? (
        <div className="ai-review panel">
          <div className="ai-review__head">
            <span className="panel-kicker">AI REVIEW · PREVIEW</span>
            <span className="ai-review__dot">
              <span />
              待开放
            </span>
          </div>
          <div className="ai-review__body">
            <span className="ai-review__mark">
              <Sparkles size={28} strokeWidth={1.4} />
            </span>
            <h2>让词走进更远的语境。</h2>
            <p>
              训练模式会追问你对这个词的理解，探索模式会把它带进新的句子和场景。
              自主复习稳定之后，这里会慢慢亮起来。
            </p>
            <div className="ai-tabs" role="tablist" aria-label="AI 复习模式">
              <button
                type="button"
                role="tab"
                aria-selected={aiTab === 'train'}
                className={aiTab === 'train' ? 'is-active' : ''}
                onClick={() => setAiTab('train')}
              >
                训练模式
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={aiTab === 'explore'}
                className={aiTab === 'explore' ? 'is-active' : ''}
                onClick={() => setAiTab('explore')}
              >
                探索模式
              </button>
            </div>
            <button type="button" className="button button--ghost" disabled>
              {aiTab === 'train' ? '训练入口尚未开放' : '探索入口尚未开放'}
            </button>
          </div>
          <div className="ai-review__foot">
            <span>当前词库 · {library.name}</span>
            <button type="button" className="text-link" onClick={() => setMode('self')}>
              回到自主复习
              <ArrowRight size={13} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      ) : (
        <div className="review-layout">
          <div className="review-main">
            <article className="review-card panel">
              <div className="review-card__top">
                <div>
                  <span className="panel-kicker">RANDOM ENCOUNTER</span>
                  <span className="review-index">{word ? `INDEX · ${String(word.id).padStart(3, '0')}` : 'INDEX · —'}</span>
                </div>
                <span className="review-pool">
                  <TimerOff size={13} strokeWidth={1.7} />
                  可复习 {poolSize} 个词
                </span>
              </div>

              {stage === 'loading' && (
                <div className="review-state">
                  <LoaderCircle className="spin" size={20} strokeWidth={1.8} />
                  正在抽取一个词…
                </div>
              )}

              {stage === 'empty' && (
                <div className="review-state review-state--empty">
                  <h2>词库里暂时没有需要复习的词。</h2>
                  <p>去记一个新词，或者取消归档一个旧词。</p>
                  <button type="button" className="button button--primary" onClick={() => onNavigate('capture')}>
                    去记一个词
                    <ArrowRight size={15} strokeWidth={1.9} />
                  </button>
                </div>
              )}

              {stage === 'error' && (
                <div className="review-state review-state--empty">
                  <h2>没有连接到本地 API。</h2>
                  <p>{error}</p>
                  <button type="button" className="button button--primary" onClick={() => void loadNext()}>
                    重试
                  </button>
                </div>
              )}

              {word && stage === 'prompt' && (
                <>
                  <h2 className="review-word">{word.word}</h2>
                  <div className="review-forms">
                    {word.forms.map((form) => (
                      <span key={form}>{form}</span>
                    ))}
                  </div>
                  <p className="review-prompt">先不看记录。写下你记得的中文，或脑海里的画面。</p>
                  <textarea
                    className="review-answer"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    rows={4}
                    placeholder="它是什么意思？你第一次在哪里见到它？"
                  />
                  <div className="review-card__actions">
                    <span className="review-hint">Ctrl + Enter 翻开</span>
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => setStage('reveal')}
                    >
                      翻开记录
                      <ArrowRight size={15} strokeWidth={1.9} />
                    </button>
                  </div>
                </>
              )}

              {word && stage === 'reveal' && (
                <>
                  <h2 className="review-word">{word.word}</h2>
                  {answer && <p className="review-your-answer">你写下：{answer}</p>}
                  <div className="review-record">
                    <span className="panel-kicker">YOUR RECORD</span>
                    <p>{word.note || '这个词还没有写下联想。'}</p>
                    {word.sentences[0] && <blockquote>{word.sentences[0]}</blockquote>}
                  </div>
                  <p className="review-prompt">这一次，算想起来了吗？</p>
                  <div className="review-assess">
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={submitting}
                      onClick={() => void assess('incorrect')}
                    >
                      还差一点
                    </button>
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={submitting}
                      onClick={() => void assess('correct')}
                    >
                      {submitting ? (
                        <LoaderCircle className="spin" size={15} strokeWidth={1.8} />
                      ) : (
                        <Check size={15} strokeWidth={2} />
                      )}
                      {submitting ? '记录中…' : '想起来了'}
                    </button>
                  </div>
                </>
              )}

              {word && stage === 'result' && (
                <>
                  <span className="result-stamp is-correct">ENCOUNTER RECORDED</span>
                  <h2 className="review-word">{word.word}</h2>
                  <div className="review-result">
                    <p>
                      这次见面已经记下。贡献、本档进度和总分都已更新。
                    </p>
                    <div className="result-metrics">
                      <span>
                        <b>{word.contribution.toFixed(3)}</b>
                        当前贡献
                      </span>
                      <span>
                        <b>{blockProgress} / 5</b>
                        本档进度
                      </span>
                      <span>
                        <b>{word.review_count}</b>
                        总见面
                      </span>
                    </div>
                  </div>
                  {word.related.length > 0 && (
                    <div className="review-result-related">
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
                            <Link2 size={10} strokeWidth={1.8} />
                            {related.word}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="review-card__actions">
                    <button type="button" className="button button--ghost" onClick={() => void loadNext(word.id)}>
                      <RotateCcw size={14} strokeWidth={1.8} />
                      再遇见一个
                    </button>
                    <button type="button" className="button button--primary" onClick={() => void loadNext(word.id)}>
                      下一个词
                      <ArrowRight size={15} strokeWidth={1.9} />
                    </button>
                  </div>
                </>
              )}

              {word && stage !== 'loading' && stage !== 'empty' && stage !== 'error' && (
                <div className="review-card__foot">
                  <button
                    type="button"
                    className="text-link text-link--muted"
                    disabled={archiving}
                    onClick={() => void archive()}
                  >
                    <Archive size={13} strokeWidth={1.7} />
                    {archiving ? '归档中…' : '归档这个词'}
                  </button>
                  <span>{error || '对错由你判断'}</span>
                </div>
              )}
            </article>
          </div>

          <aside className="review-side">
            <div className="score-card panel">
              <div className="panel-head panel-head--tight">
                <div>
                  <span className="panel-kicker">CURRENT SCORE</span>
                  <h2>{library.name}</h2>
                </div>
                <span className="score-level">{overview?.level ?? '读取中'}</span>
              </div>
              <div className="score-value">{score.toFixed(3)}</div>
              <div className="score-note">100 分约为 CET-4 水平 · 不设上限</div>
              <div className="score-track">
                <span style={{ width: `${Math.max(2, (overview?.score_progress ?? 0) * 100)}%` }} />
                <i />
              </div>
              <div className="score-scale">
                <span>0</span>
                <span>100 · CET-4</span>
              </div>
              <div className="score-metrics">
                <span>
                  <b>{overview?.total_words ?? library.word_count}</b>
                  词条
                </span>
                <span>
                  <b>{overview?.total_reviews ?? 0}</b>
                  见面
                </span>
                <span>
                  <b>{overview?.settlement_count ?? 0}</b>
                  结算
                </span>
              </div>
              <div className="block-dots">
                {[0, 1, 2, 3, 4].map((index) => (
                  <span
                    key={index}
                    className={
                      index < blockProgress
                        ? 'is-done'
                        : index === blockProgress
                          ? 'is-current'
                          : ''
                    }
                  />
                ))}
                <small>本档 {blockProgress} / 5</small>
              </div>
            </div>

            <div className="trend-card panel">
              <div className="panel-head panel-head--tight">
                <div>
                  <span className="panel-kicker">RECENT SETTLEMENTS</span>
                  <h2>最近的形状</h2>
                </div>
                <TrendingUp size={16} strokeWidth={1.7} />
              </div>
              {trend.length > 0 ? (
                <div className="mini-trend">
                  {trend.map((point) => (
                    <span
                      key={point.id}
                      title={`${point.word} ${point.delta > 0 ? '+' : ''}${point.delta.toFixed(3)}`}
                      style={{ height: `${Math.max(8, (Math.abs(point.delta) / maxTrend) * 74)}px` }}
                    />
                  ))}
                </div>
              ) : (
                <div className="mini-trend-empty">还没有结算记录。</div>
              )}
              <div className="trend-foot">
                <span>最近 {trend.length} 次结算</span>
                <b>{(overview?.score ?? 0).toFixed(3)}</b>
              </div>
            </div>

            <div className="review-side-note">
              <Target size={15} strokeWidth={1.7} />
              <p>熟悉度越高的词，出现得越少。你不需要追赶任何进度。</p>
            </div>

            <button type="button" className="side-link side-link--review" onClick={() => onNavigate('library')}>
              去词库看看
              <ChevronRight size={13} strokeWidth={1.8} />
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}
