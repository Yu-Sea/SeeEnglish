import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  CornerDownLeft,
  GraduationCap,
  Link2,
  LoaderCircle,
  Quote,
  RotateCcw,
  Sparkles,
  Target,
  TimerOff,
  TrendingUp,
} from 'lucide-react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type {
  ArchiveSettlement,
  BlockSettlement,
  GlobalOverview,
  ReviewOutcome,
  ReviewResult,
  Stats,
  TabId,
  WordEntry,
} from '../types';

interface ReviewPageProps {
  stats: Stats | null;
  libraryId: number;
  immersive: boolean;
  onNavigate: (tab: TabId) => void;
  onOpenRelated: (wordId: number) => void;
}

type ReviewMode = 'cards' | 'ai';
type ReviewStage = 'loading' | 'prompt' | 'reveal' | 'result' | 'archived' | 'empty' | 'error';

interface ReviewMemory {
  libraryId: number;
  mode: ReviewMode;
  stage: ReviewStage;
  word: WordEntry | null;
  overview: GlobalOverview | null;
  outcome: ReviewOutcome | null;
  archiveSettlement: ArchiveSettlement | null;
  answer: string;
  poolSize: number;
  error: string;
}

// Keep the in-progress card alive while the user visits another tab. The cache
// is module-local, so it survives navigation but not a full page reload.
let reviewMemory: ReviewMemory | null = null;

const SCORE_TICKS = [
  { position: 0, label: '0' },
  { position: 18, label: '25' },
  { position: 36, label: '50' },
  { position: 72, label: '100', note: 'CET-4', key: true },
  { position: 90, label: '200' },
  { position: 100, label: '∞' },
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return '没有连接到本地 API，请确认服务还在运行。';
}

function signed(value: number): string {
  if (value > 0) return `+${value.toFixed(3)}`;
  if (value < 0) return `−${Math.abs(value).toFixed(3)}`;
  return '±0.000';
}

function formatScore(value: number): string {
  return value.toFixed(3);
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function stageLabel(stage: ReviewStage): string {
  if (stage === 'reveal') return 'RECORD · 翻开记录';
  if (stage === 'result') return 'ENCOUNTER · 这次见面';
  if (stage === 'archived') return 'ARCHIVED · 已归档';
  return 'RANDOM ENCOUNTER · 随机遇见';
}

export function ReviewPage({
  stats,
  libraryId,
  immersive,
  onNavigate,
  onOpenRelated,
}: ReviewPageProps) {
  const [restored] = useState<ReviewMemory | null>(() =>
    reviewMemory?.libraryId === libraryId ? reviewMemory : null,
  );
  const [mode, setMode] = useState<ReviewMode>(restored?.mode ?? 'cards');
  const [stage, setStage] = useState<ReviewStage>(restored?.stage ?? 'loading');
  const [word, setWord] = useState<WordEntry | null>(restored?.word ?? null);
  const [overview, setOverview] = useState<GlobalOverview | null>(restored?.overview ?? null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(restored?.outcome ?? null);
  const [archiveSettlement, setArchiveSettlement] = useState<ArchiveSettlement | null>(
    restored?.archiveSettlement ?? null,
  );
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [answer, setAnswer] = useState(restored?.answer ?? '');
  const [poolSize, setPoolSize] = useState(restored?.poolSize ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState(restored?.error ?? '');
  const requestSeq = useRef(0);
  const bootedRef = useRef(false);
  const submittingRef = useRef(false);

  const loadNext = useCallback(async (excludeId?: number) => {
    const seq = ++requestSeq.current;
    setStage('loading');
    setWord(null);
    setOutcome(null);
    setArchiveSettlement(null);
    setArchiveConfirm(false);
    setAnswer('');
    setError('');

    try {
      const data = await api.reviewNext(libraryId, excludeId);
      if (seq !== requestSeq.current) return;
      setWord(data.word);
      setOverview(data.overview);
      setPoolSize(data.pool_size);
      setStage('prompt');
    } catch (loadError) {
      if (seq !== requestSeq.current) return;
      if (loadError instanceof ApiError && loadError.status === 404) {
        try {
          const emptyOverview = await api.reviewOverview(libraryId);
          if (seq === requestSeq.current) setOverview(emptyOverview);
        } catch {
          // Keep the last known overview if the API is unavailable.
        }
        setPoolSize(0);
        setStage('empty');
        return;
      }
      setError(errorMessage(loadError));
      setStage('error');
    }
  }, [libraryId]);

  useEffect(() => {
    reviewMemory = {
      libraryId,
      mode,
      stage,
      word,
      overview,
      outcome,
      archiveSettlement,
      answer,
      poolSize,
      error,
    };
  }, [libraryId, mode, stage, word, overview, outcome, archiveSettlement, answer, poolSize, error]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const memory = restored?.libraryId === libraryId ? restored : null;
    const missingCard =
      memory &&
      !memory.word &&
      ['prompt', 'reveal', 'result', 'archived'].includes(memory.stage);

    if (
      !memory ||
      memory.stage === 'loading' ||
      missingCard ||
      (memory.mode === 'cards' && memory.stage === 'empty')
    ) {
      void loadNext();
    }
  }, [loadNext, libraryId, restored]);

  const reveal = () => {
    if (stage === 'prompt') setStage('reveal');
  };

  const assess = async (result: ReviewResult) => {
    if (!word || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const next = await api.reviewWord(word.id, {
        result,
        answer: answer.trim(),
      });
      setWord(next.word);
      setOverview(next.overview);
      setOutcome(next.outcome);
      setStage('result');
    } catch (assessError) {
      setError(errorMessage(assessError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const archiveWord = async () => {
    if (!word || archiving) return;
    setArchiving(true);
    setError('');
    try {
      const archived = await api.archiveWord(word.id);
      setWord(archived.word);
      setOverview(archived.overview);
      setArchiveSettlement(archived.settlement);
      setOutcome(null);
      setPoolSize((value) => Math.max(0, value - 1));
      setArchiveConfirm(false);
      setStage('archived');
    } catch (archiveError) {
      setError(errorMessage(archiveError));
    } finally {
      setArchiving(false);
    }
  };

  const again = () => {
    if (!word) return;
    void loadNext(word.id);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    reveal();
  };

  const handleAnswerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (answer.trim()) reveal();
    }
  };

  const totalWords = overview?.total_words ?? stats?.words ?? 0;
  const wordCount = Math.max(totalWords, poolSize);
  const showGrid = stage !== 'error';
  const emptyTarget: TabId = totalWords > 0 ? 'library' : 'add';
  const emptyLabel = totalWords > 0 ? '去词库看看' : '去记一个词';

  return (
    <section className="page page--review">
      {!immersive && (
        <header className="page-head">
          <div className="eyebrow">
            <span className="eyebrow__line" />
            REVIEW · 02
          </div>
          <div className="page-head__row">
            <div>
              <h1 className="page-title">让记忆，再回来一次。</h1>
              <p className="page-subtitle">
                没有今日任务，也没有连续打卡。随机遇见一个词，写下你记得的，再决定这次算不算想起来。
              </p>
              <div className="review-head-meta">
                <span>
                  <TimerOff size={13} strokeWidth={1.7} />
                  没有计时
                </span>
                <span>
                  <BookOpen size={13} strokeWidth={1.7} />
                  可复习 {poolSize || Math.max(0, wordCount - (overview?.archived_words ?? 0))} 个词
                </span>
                <span>
                  <Archive size={13} strokeWidth={1.7} />
                  已归档 {overview?.archived_words ?? 0}
                </span>
                <span>对错由你判断</span>
              </div>
            </div>

            <div className="review-mode-switch" role="tablist" aria-label="复习方式">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'cards'}
                className={mode === 'cards' ? 'is-active' : ''}
                onClick={() => setMode('cards')}
                title="自主复习"
              >
                <BookOpen size={15} strokeWidth={1.8} />
                自主
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'ai'}
                className={mode === 'ai' ? 'is-active' : ''}
                onClick={() => setMode('ai')}
                title="AI 复习"
              >
                <Sparkles size={15} strokeWidth={1.8} />
                AI
              </button>
            </div>
          </div>
        </header>
      )}

      <div
        className={`review-shell ${
          immersive ? 'review-shell--immersive' : 'review-shell--standard'
        }`}
      >
        <div className="review-main">
          {mode === 'ai' ? (
            <AiReviewPanel onBack={() => setMode('cards')} />
          ) : showGrid ? (
            <div className="review-workspace">
              {stage === 'empty' ? (
                <ReviewPlaceholder
                  stage="empty"
                  error=""
                  emptyLabel={emptyLabel}
                  emptyTarget={emptyTarget}
                  onRetry={() => void loadNext()}
                  onNavigate={onNavigate}
                />
              ) : (
                <ReviewCard
                  stage={stage}
                  word={word}
                  answer={answer}
                  outcome={outcome}
                  archiveSettlement={archiveSettlement}
                  archiveConfirm={archiveConfirm}
                  submitting={submitting}
                  archiving={archiving}
                  error={error}
                  onAnswerChange={setAnswer}
                  onAnswerKeyDown={handleAnswerKeyDown}
                  onSubmit={handleSubmit}
                  onReveal={reveal}
                  onAssess={assess}
                  onAgain={again}
                  onArchiveRequest={() => setArchiveConfirm(true)}
                  onArchiveCancel={() => setArchiveConfirm(false)}
                  onArchive={archiveWord}
                  onNavigate={onNavigate}
                  onOpenRelated={onOpenRelated}
                />
              )}
              {overview ? (
                <ReviewScorePanel overview={overview} word={word} outcome={outcome} />
              ) : (
                <ScorePanelSkeleton />
              )}
            </div>
          ) : (
            <ReviewPlaceholder
              stage="error"
              error={error}
              emptyLabel={emptyLabel}
              emptyTarget={emptyTarget}
              onRetry={() => void loadNext()}
              onNavigate={onNavigate}
            />
          )}
        </div>

        {immersive && (
          <aside className="review-mode-rail">
            <div className="review-mode-switch review-mode-switch--vertical" role="tablist" aria-label="复习方式">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'cards'}
                className={mode === 'cards' ? 'is-active' : ''}
                onClick={() => setMode('cards')}
                title="自主复习"
              >
                <BookOpen size={15} strokeWidth={1.8} />
                <span>自主</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'ai'}
                className={mode === 'ai' ? 'is-active' : ''}
                onClick={() => setMode('ai')}
                title="AI 复习"
              >
                <Sparkles size={15} strokeWidth={1.8} />
                <span>AI</span>
              </button>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

interface ReviewCardProps {
  stage: ReviewStage;
  word: WordEntry | null;
  answer: string;
  outcome: ReviewOutcome | null;
  archiveSettlement: ArchiveSettlement | null;
  archiveConfirm: boolean;
  submitting: boolean;
  archiving: boolean;
  error: string;
  onAnswerChange: (value: string) => void;
  onAnswerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReveal: () => void;
  onAssess: (result: ReviewResult) => void;
  onAgain: () => void;
  onArchiveRequest: () => void;
  onArchiveCancel: () => void;
  onArchive: () => void;
  onNavigate: (tab: TabId) => void;
  onOpenRelated: (wordId: number) => void;
}

function ReviewCard({
  stage,
  word,
  answer,
  outcome,
  archiveSettlement,
  archiveConfirm,
  submitting,
  archiving,
  error,
  onAnswerChange,
  onAnswerKeyDown,
  onSubmit,
  onReveal,
  onAssess,
  onAgain,
  onArchiveRequest,
  onArchiveCancel,
  onArchive,
  onNavigate,
  onOpenRelated,
}: ReviewCardProps) {
  if (stage === 'loading' || !word) {
    return (
      <article className="review-card review-card--loading glass" aria-live="polite">
        <LoaderCircle className="spin" size={22} strokeWidth={1.7} />
        <div>
          <p>正在从词库里随机取一个词…</p>
          <span>分数较低和最近没想起来的词，会更常出现。</span>
        </div>
      </article>
    );
  }

  const longWord = word.word.length > 14;

  return (
    <article className={`review-card glass review-card--${stage}`}>
      <div className="review-card__top">
        <span className="eyebrow">{stageLabel(stage)}</span>
        <span className="review-card__count">
          第 {stage === 'result' || stage === 'archived' ? word.review_count : word.review_count + 1} 次见面
        </span>
      </div>

      <div className="review-card__body" key={stage}>
        <div className={`review-word ${longWord ? 'is-long' : ''}`}>{word.word}</div>

        {stage === 'prompt' && (
          <form className="review-prompt" onSubmit={onSubmit}>
            <p className="review-prompt__copy">
              先不查答案。用中文写下你记得的意思，或者遇见它时的画面。
            </p>
            <label className="review-answer">
              <span className="review-answer__label">你记得的</span>
              <textarea
                value={answer}
                onChange={(event) => onAnswerChange(event.target.value)}
                onKeyDown={onAnswerKeyDown}
                rows={3}
                maxLength={2000}
                placeholder="中文意思、关键词、一个画面……"
              />
              <span className="review-answer__hint">
                <CornerDownLeft size={12} strokeWidth={1.7} />
                Ctrl / ⌘ + Enter 也可以翻开
              </span>
            </label>
            <div className="review-prompt__actions">
              <button type="submit" className="button button--primary" disabled={!answer.trim()}>
                确认，翻看记录
                <ArrowRight size={17} strokeWidth={1.9} />
              </button>
              <button type="button" className="review-skip" onClick={onReveal}>
                想不起来，直接看
              </button>
            </div>
            <p className="review-prompt__note">没有计时，也不会打断你。写多少都算数。</p>
          </form>
        )}

        {stage === 'reveal' && (
          <div className="review-reveal">
            <RecordContent word={word} answer={answer} onOpenRelated={onOpenRelated} />
            <div className="review-check">
              <div>
                <span className="eyebrow">YOUR CALL</span>
                <h3>刚才，你想起来了吗？</h3>
                <p>由你判断。每 5 次见面才会结算一次总分。</p>
              </div>
              <div className="review-check__actions">
                <button
                  type="button"
                  className="review-choice review-choice--no"
                  onClick={() => onAssess('incorrect')}
                  disabled={submitting}
                >
                  {submitting ? (
                    <LoaderCircle className="spin" size={17} strokeWidth={1.8} />
                  ) : (
                    <RotateCcw size={17} strokeWidth={1.8} />
                  )}
                  还差一点
                </button>
                <button
                  type="button"
                  className="review-choice review-choice--yes"
                  onClick={() => onAssess('correct')}
                  disabled={submitting}
                >
                  {submitting ? (
                    <LoaderCircle className="spin" size={17} strokeWidth={1.8} />
                  ) : (
                    <Check size={17} strokeWidth={2} />
                  )}
                  想起来了
                </button>
              </div>
            </div>
            {error && <p className="review-inline-error">{error}</p>}
          </div>
        )}

        {stage === 'result' && outcome && (
          <div className="review-result" aria-live="polite">
            <div className="review-result__head">
              <div>
                <span className="eyebrow">THIS ENCOUNTER</span>
                <p className="review-result__choice">
                  {outcome.result === 'correct' ? '想起来了' : '还差一点'}
                </p>
              </div>
              {outcome.block_settlement ? (
                <span
                  className={`review-result__delta ${
                    outcome.block_settlement.score_delta >= 0 ? 'is-positive' : 'is-soft-negative'
                  }`}
                >
                  {signed(outcome.block_settlement.score_delta)}
                </span>
              ) : (
                <span className="review-result__pending">
                  本档 {word.block_reviews} / 5
                </span>
              )}
            </div>

            <p className="review-result__copy">
              {outcome.result === 'correct'
                ? '这次被你想起来了。它已经记进这一档。'
                : '没关系，下一次会更大概率遇见它。'}
            </p>

            {outcome.block_settlement ? (
              <BlockSettlementCard settlement={outcome.block_settlement} />
            ) : (
              <div className="review-block-waiting">
                <div className="review-block-waiting__head">
                  <span>本档进度</span>
                  <span>{word.block_reviews} / 5</span>
                </div>
                <div className="review-block-dots" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span
                      className={index < word.block_reviews ? 'is-filled' : ''}
                      key={index}
                    />
                  ))}
                </div>
                <p>
                  再见面 {5 - word.block_reviews} 次，结算这一档。
                  {outcome.result === 'incorrect'
                    ? ' 这一次也会被算进正确率。'
                    : ''}
                </p>
              </div>
            )}

            <div className="review-result__meta">
              <span>本档 {word.block_reviews} / 5</span>
              <span>累计见面 {word.review_count} 次</span>
              <span>这个词贡献 {word.contribution.toFixed(3)} / 0.050</span>
            </div>

            {word.related.length > 0 && (
              <div className="review-result__related">
                <h4>关联词</h4>
                <div className="relation-chips">
                  {word.related.map((related) => (
                    <button
                      type="button"
                      className="relation-chip relation-chip--link"
                      key={related.id}
                      onClick={() => onOpenRelated(related.id)}
                      title={`打开 ${related.word}`}
                    >
                      <Link2 size={11} strokeWidth={1.8} />
                      {related.word}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {archiveConfirm && (
              <div className="review-archive-confirm" aria-live="polite">
                <div>
                  <span className="eyebrow">ARCHIVE THIS WORD</span>
                  <p>
                    归档后不再出现在复习里，当前最高贡献 <b>0.050</b> 会直接计入总分。
                  </p>
                </div>
                <div className="review-archive-confirm__actions">
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={onArchiveCancel}
                    disabled={archiving}
                  >
                    再想想
                  </button>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={onArchive}
                    disabled={archiving}
                  >
                    {archiving ? (
                      <LoaderCircle className="spin" size={16} strokeWidth={1.8} />
                    ) : (
                      <Archive size={16} strokeWidth={1.8} />
                    )}
                    {archiving ? '归档中…' : '确认归档'}
                  </button>
                </div>
              </div>
            )}
            {error && <p className="review-inline-error">{error}</p>}

            <div className="review-result__actions">
              <button type="button" className="button button--primary" onClick={onAgain}>
                再遇一个
                <ArrowRight size={17} strokeWidth={1.9} />
              </button>
              {!archiveConfirm && (
                <button type="button" className="button button--outline" onClick={onArchiveRequest}>
                  <Archive size={16} strokeWidth={1.8} />
                  已经很熟，归档
                </button>
              )}
            </div>
          </div>
        )}

        {stage === 'archived' && archiveSettlement && (
          <div className="review-archived" aria-live="polite">
            <span className="review-archived__mark">
              <Archive size={28} strokeWidth={1.5} />
            </span>
            <span className="eyebrow">ARCHIVED · 已归档</span>
            <h2>这个词，已经收好了。</h2>
            <p>
              它不会再出现在复习里，当前最高贡献已经计入总分。
              你仍然可以在词库里看到它、补充它。
            </p>
            <div className="review-archived__score">
              <span>本次计入总分</span>
              <b>{signed(archiveSettlement.delta)}</b>
            </div>
            <div className="review-result__meta">
              <span>归档词贡献 {archiveSettlement.contribution_after.toFixed(3)}</span>
              <span>总分 {archiveSettlement.score_after.toFixed(3)}</span>
            </div>
            <div className="review-result__actions">
              <button type="button" className="button button--primary" onClick={onAgain}>
                再遇一个
                <ArrowRight size={17} strokeWidth={1.9} />
              </button>
              <button
                type="button"
                className="button button--outline"
                onClick={() => onNavigate('library')}
              >
                去词库看看
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function RecordContent({
  word,
  answer,
  onOpenRelated,
}: {
  word: WordEntry;
  answer: string;
  onOpenRelated: (wordId: number) => void;
}) {
  const hasRecord = Boolean(word.note || word.sentences.length || word.related.length);

  return (
    <div className="review-record">
      <div className="review-user-answer">
        <span className="eyebrow">你写下的</span>
        <p className={answer.trim() ? '' : 'is-muted'}>
          {answer.trim() || '这次没有写，也没关系。'}
        </p>
      </div>

      {hasRecord ? (
        <>
          <div className="review-record__block">
            <h4>词库里的理解</h4>
            <p className={word.note ? '' : 'is-muted'}>
              {word.note || '这个词还没有留下联想。'}
            </p>
          </div>

          {word.sentences.length > 0 && (
            <div className="review-record__block">
              <h4>例句</h4>
              <div className="review-record__sentences">
                {word.sentences.map((sentence) => (
                  <p key={sentence}>
                    <Quote size={13} strokeWidth={1.8} />
                    <span>{sentence}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {word.related.length > 0 && (
            <div className="review-record__block review-record__related">
              <h4>关联词</h4>
              <div>
                {word.related.map((related) => (
                  <button
                    type="button"
                    className="relation-chip relation-chip--link"
                    key={related.id}
                    onClick={() => onOpenRelated(related.id)}
                    title={`打开 ${related.word}`}
                  >
                    <Link2 size={11} strokeWidth={1.8} />
                    {related.word}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="review-record__empty">
          <BookOpen size={18} strokeWidth={1.6} />
          <p>这个词还没有更多记录。下次记词时，可以给它留一句话。</p>
        </div>
      )}
    </div>
  );
}

function BlockSettlementCard({ settlement }: { settlement: BlockSettlement }) {
  const positive = settlement.score_delta >= 0;
  return (
    <div className={`block-settlement ${positive ? 'is-positive' : 'is-soft-negative'}`}>
      <div className="block-settlement__top">
        <span>第 {settlement.block_number} 档结算</span>
        <b>{signed(settlement.score_delta)}</b>
      </div>
      <p>
        {settlement.label} · 这一档想起了 {settlement.correct} / {settlement.total} 次
      </p>
      <div className="block-settlement__meta">
        <span>本词贡献 {settlement.word_delta >= 0 ? '+' : '−'}{Math.abs(settlement.word_delta).toFixed(3)}</span>
        <span>总分 {settlement.score_after.toFixed(3)}</span>
      </div>
    </div>
  );
}

function ReviewScorePanel({
  overview,
  word,
  outcome,
}: {
  overview: GlobalOverview;
  word: WordEntry | null;
  outcome: ReviewOutcome | null;
}) {
  const progress = Math.min(100, Math.max(0, overview.score_progress * 100));
  const visibleDelta = outcome?.block_settlement?.score_delta ?? null;
  const blockReviews = word?.block_reviews ?? 0;
  const recent = overview.trend[overview.trend.length - 1];

  return (
    <aside className={`review-score glass ${outcome ? 'is-updated' : ''}`} aria-label="总掌握分">
      <div className="review-score__head">
        <span className="eyebrow">TOTAL SCORE · 总掌握分</span>
        <span className="review-score__cap">NO CEILING</span>
      </div>

      <div className="review-score__value">
        <span className="review-score__number" key={overview.score}>
          {formatScore(overview.score)}
        </span>
        <span className="review-score__unit">分</span>
        {visibleDelta !== null && (
          <span
            className={`review-score__delta ${
              visibleDelta >= 0 ? 'is-positive' : 'is-soft-negative'
            }`}
          >
            {signed(visibleDelta)}
          </span>
        )}
      </div>

      <div className="review-score__level">
        <span className="review-score__level-dot" />
        {overview.level}
        <span className="review-score__cet">
          <GraduationCap size={12} strokeWidth={1.8} />
          100 = CET-4
        </span>
      </div>

      <div
        className="score-track"
        role="img"
        aria-label={`总掌握分 ${overview.score.toFixed(3)}，100 分约为大学英语四级水平，不设上限`}
      >
        <span className="score-track__fill" style={{ width: `${progress}%` }} />
        {SCORE_TICKS.map((tick) => (
          <span
            className={`score-track__tick ${tick.key ? 'is-key' : ''}`}
            style={{ left: `${tick.position}%` }}
            key={tick.label}
          />
        ))}
        <span className="score-track__now" style={{ left: `${progress}%` }} />
      </div>

      <div className="score-axis" aria-hidden="true">
        {SCORE_TICKS.map((tick) => (
          <span
            className={`score-axis__label ${tick.key ? 'is-key' : ''}`}
            style={{ left: `${tick.position}%` }}
            key={tick.label}
          >
            {tick.label}
            {tick.note && <small>{tick.note}</small>}
          </span>
        ))}
      </div>

      <p className="review-score__source">
        来自 {overview.total_words} 个词 · 已归档 {overview.archived_words}
      </p>

      <div className="review-score__metrics review-score__metrics--three">
        <div>
          <span>ACCURACY</span>
          <b>{formatPercent(word?.accuracy ?? null)}</b>
          <small>正确率</small>
        </div>
        <div>
          <span>MEETINGS</span>
          <b>{word?.review_count ?? '—'}</b>
          <small>次见面</small>
        </div>
        <div>
          <span>BLOCK</span>
          <b>{word ? `${blockReviews}/5` : '—'}</b>
          <small>本档</small>
        </div>
      </div>

      <div className="review-score__block">
        <div className="review-score__block-head">
          <span>本档进度</span>
          <span>{word ? `${word.block_correct} 次想起` : '等待一个词'}</span>
        </div>
        <div className="review-block-dots" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <span className={index < blockReviews ? 'is-filled' : ''} key={index} />
          ))}
        </div>
      </div>

      <ScoreTrend overview={overview} latest={recent} />

      <p className="review-score__note">
        每 5 次见面结算一次，总分只增加“本词新旧贡献的差额”。
        归档会把该词的最高贡献直接计入总分。
      </p>
    </aside>
  );
}

function ScoreTrend({
  overview,
  latest,
}: {
  overview: GlobalOverview;
  latest: GlobalOverview['trend'][number] | undefined;
}) {
  const trend = overview.trend;
  const points = trend.map((point) => point.score_after);
  const chartWidth = 280;
  const chartHeight = 84;
  const paddingX = 8;
  const top = 9;
  const bottom = 72;

  let polyline = '';
  let area = '';
  let lastPoint: { x: number; y: number } | null = null;

  if (points.length > 0) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = Math.max(max - min, 0.01);
    const coordinates = points.map((value, index) => {
      const x =
        points.length === 1
          ? chartWidth / 2
          : paddingX + (index / (points.length - 1)) * (chartWidth - paddingX * 2);
      const y = bottom - ((value - min) / range) * (bottom - top);
      return { x, y };
    });
    polyline = coordinates.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const first = coordinates[0];
    lastPoint = coordinates[coordinates.length - 1];
    area = `${first.x.toFixed(1)},${bottom} ${polyline} ${lastPoint.x.toFixed(1)},${bottom}`;
  }

  return (
    <div className="score-trend">
      <div className="score-trend__head">
        <span className="eyebrow">
          <TrendingUp size={12} strokeWidth={1.8} />
          SCORE TREND
        </span>
        <span>{trend.length === 0 ? '等待第一次结算' : `最近 ${trend.length} 次结算`}</span>
      </div>

      {trend.length === 0 ? (
        <div className="score-trend__empty">
          每 5 次见面结算一次，这里会留下最近 25 次的分数变化。
        </div>
      ) : (
        <>
          <svg
            className="score-trend__svg"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label="最近 25 次总分结算趋势"
          >
            <line
              x1="0"
              y1={bottom + 2}
              x2={chartWidth}
              y2={bottom + 2}
              className="score-trend__baseline"
            />
            {area && <polygon points={area} className="score-trend__area" />}
            {polyline && <polyline points={polyline} className="score-trend__line" />}
            {lastPoint && (
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="3.4"
                className="score-trend__dot"
              />
            )}
          </svg>
          <div className="score-trend__foot">
            <span>
              {latest?.kind === 'archive'
                ? '归档'
                : latest?.kind === 'delete'
                  ? '删除'
                  : latest?.kind === 'import'
                    ? '导入'
                    : '结算'}{' '}
              · {latest?.word}{' '}
              <b className={(latest?.delta ?? 0) >= 0 ? 'is-positive' : 'is-soft-negative'}>
                {signed(latest?.delta ?? 0)}
              </b>
            </span>
            <span>总分 {formatScore(overview.score)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ScorePanelSkeleton() {
  return (
    <aside className="review-score review-score--skeleton glass" aria-hidden="true">
      <span className="eyebrow">TOTAL SCORE</span>
      <span className="review-skeleton review-skeleton--number" />
      <span className="review-skeleton review-skeleton--line" />
      <span className="review-skeleton review-skeleton--track" />
      <div className="review-skeleton__grid">
        <span className="review-skeleton" />
        <span className="review-skeleton" />
        <span className="review-skeleton" />
        <span className="review-skeleton" />
      </div>
    </aside>
  );
}

function ReviewPlaceholder({
  stage,
  error,
  emptyLabel,
  emptyTarget,
  onRetry,
  onNavigate,
}: {
  stage: ReviewStage;
  error: string;
  emptyLabel: string;
  emptyTarget: TabId;
  onRetry: () => void;
  onNavigate: (tab: TabId) => void;
}) {
  if (stage === 'empty') {
    return (
      <div className="review-empty glass">
        <span className="review-empty__icon">
          <BookOpen size={28} strokeWidth={1.5} />
        </span>
        <span className="eyebrow">NOTHING TO MEET YET</span>
        <h2>暂时没有可复习的词。</h2>
        <p>词库可能还是空的，也可能所有词都已经归档。去词库看看，或者再记一个新词。</p>
        <button
          type="button"
          className="button button--primary"
          onClick={() => onNavigate(emptyTarget)}
        >
          {emptyLabel}
          <ArrowRight size={17} strokeWidth={1.9} />
        </button>
      </div>
    );
  }

  return (
    <div className="review-empty glass">
      <span className="review-empty__icon">
        <TimerOff size={28} strokeWidth={1.5} />
      </span>
      <span className="eyebrow">LOCAL API · OFFLINE</span>
      <h2>这次没有连接到词库。</h2>
      <p>{error || '请确认本地 API 正在运行，再试一次。'}</p>
      <button type="button" className="button button--outline" onClick={onRetry}>
        <RotateCcw size={16} strokeWidth={1.8} />
        再试一次
      </button>
    </div>
  );
}

function AiReviewPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="ai-review">
      <div className="ai-review__lead glass">
        <div className="ai-review__lead-copy">
          <span className="eyebrow">
            <span className="pulse-dot is-warm" />
            AI REVIEW · 待开放
          </span>
          <h2>和一个 AI，一起复习。</h2>
          <p>
            先留一个位置。我们不想只做一个聊天框，而是让 AI 真正接住你的词库、
            你的联想，和你每次想不起来的地方。
          </p>
          <div className="ai-review__preview">
            <span>AI · 预览</span>
            <p>“上次你写，serendipity 是在一次迷路时遇见的。今天，能换一个句子用它吗？”</p>
            <small>这只是一段示意，功能尚未开放。</small>
          </div>
        </div>
        <div className="ai-review__mark" aria-hidden="true">
          <Sparkles size={40} strokeWidth={1.1} />
          <span>AI</span>
        </div>
      </div>

      <div className="ai-review__modes">
        <article className="ai-mode glass">
          <div className="ai-mode__top">
            <span className="ai-mode__index">01</span>
            <span className="ai-mode__status">TRAINING · 待开放</span>
          </div>
          <span className="ai-mode__icon">
            <Target size={22} strokeWidth={1.6} />
          </span>
          <h3>训练模式</h3>
          <p>AI 从你的词库出题、追问，直到你能用自己的话把它讲清楚。</p>
          <span className="ai-mode__foot">不评分，只陪练。</span>
        </article>

        <article className="ai-mode glass">
          <div className="ai-mode__top">
            <span className="ai-mode__index">02</span>
            <span className="ai-mode__status">EXPLORATION · 待开放</span>
          </div>
          <span className="ai-mode__icon">
            <Compass size={22} strokeWidth={1.6} />
          </span>
          <h3>探索模式</h3>
          <p>从一个词出发，聊语境、同义、反义和真实用法，把它用出去。</p>
          <span className="ai-mode__foot">不设终点，只往外走。</span>
        </article>
      </div>

      <div className="ai-review__foot">
        <p>AI 复习会在自主复习稳定之后接入。现在，先保留它应该有的样子。</p>
        <button type="button" className="button button--outline" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={1.8} />
          回到自主
        </button>
      </div>
    </div>
  );
}
