import { ArrowUpRight, SearchX } from 'lucide-react';
import type { WordMatch } from '../types';

interface MatchPanelProps {
  query: string;
  matches: WordMatch[];
  selectedId: number | null;
  loading: boolean;
  onChoose: (match: WordMatch) => void;
}

function labelFor(match: WordMatch): string {
  if (match.match_type === 'exact') return '完全匹配';
  if (match.match_type === 'stored') return '已记录形态';
  if (match.match_type === 'prefix') return '前缀匹配';
  if (match.match_type === 'contains') return '包含匹配';
  if (match.match_type === 'related') return '已有变体';
  return match.relation_label;
}

export function MatchPanel({ query, matches, selectedId, loading, onChoose }: MatchPanelProps) {
  if (!query.trim()) return null;

  if (loading && matches.length === 0) {
    return (
      <div className="match-panel match-panel--loading" aria-hidden="true">
        <div className="match-panel__head">
          <span className="eyebrow">SEARCHING INDEX</span>
        </div>
        <div className="skeleton-row">
          <span />
          <span />
        </div>
        <div className="skeleton-row">
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="match-panel match-panel--new" aria-live="polite">
        <div className="new-match">
          <span className="new-match__icon">
            <SearchX size={17} strokeWidth={1.8} />
          </span>
          <div>
            <p className="new-match__title">这个索引还没有被建立</p>
            <p className="new-match__copy">
              点击右侧「记词」，留下例句和属于你的理解。
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasSoftMatch = matches.some(
    (match) => match.match_type === 'derived' || match.match_type === 'related',
  );
  const hasExact = matches.some(
    (match) => match.match_type === 'exact' || match.match_type === 'stored',
  );

  return (
    <div className="match-panel" aria-live="polite">
      <div className="match-panel__head">
        <span className="eyebrow">词库匹配</span>
        <span className="match-panel__count">{String(matches.length).padStart(2, '0')}</span>
      </div>

      <div className="match-panel__list">
        {matches.map((match) => (
          <button
            key={match.id}
            type="button"
            className={`match-row ${selectedId === match.id ? 'is-selected' : ''}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChoose(match)}
          >
            <span className="match-row__body">
              <span className="match-row__title">
                <span className="match-row__word">{match.word}</span>
                {(match.match_type === 'derived' ||
                  match.match_type === 'prefix' ||
                  match.match_type === 'contains') &&
                  match.matched_form.toLowerCase() !== match.word.toLowerCase() && (
                    <span className="match-row__form">{match.matched_form}</span>
                  )}
                <span className={`match-badge match-badge--${match.match_type}`}>
                  {labelFor(match)}
                </span>
              </span>
              <span className="match-row__note">
                {match.note || match.sentences[0] || '还没有联想，补充它。'}
              </span>
            </span>
            <span className="match-row__arrow">
              <ArrowUpRight size={17} strokeWidth={1.8} />
            </span>
          </button>
        ))}
      </div>

      <div className="match-panel__foot">
        {hasSoftMatch ? (
          <>
            <span>
              <kbd>Tab</kbd> 取第一个到输入框
            </span>
            <span>直接记词则单独收录</span>
          </>
        ) : hasExact ? (
          <span>同形索引已存在 · 记词会自动变成「补充」</span>
        ) : (
          <span>选择目标词继续补充</span>
        )}
      </div>
    </div>
  );
}
