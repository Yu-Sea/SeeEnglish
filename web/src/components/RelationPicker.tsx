import { useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import type { RelatedWord, WordEntry } from '../types';

interface RelationPickerProps {
  words: WordEntry[];
  selected: RelatedWord[];
  targetId?: number;
  onAdd: (word: RelatedWord) => void;
  onRemove: (id: number) => void;
}

export function RelationPicker({
  words,
  selected,
  targetId,
  onAdd,
  onRemove,
}: RelationPickerProps) {
  const [query, setQuery] = useState('');
  const selectedIds = new Set(selected.map((word) => word.id));
  const needle = query.trim().toLowerCase();
  const candidates = words
    .filter((word) => word.id !== targetId && !selectedIds.has(word.id))
    .filter((word) => {
      if (!needle) return false;
      return (
        word.word.toLowerCase().includes(needle) ||
        word.note.toLowerCase().includes(needle) ||
        word.forms.some((form) => form.toLowerCase().includes(needle))
      );
    })
    .sort((a, b) => {
      const aExact = a.word.toLowerCase() === needle ? 0 : 1;
      const bExact = b.word.toLowerCase() === needle ? 0 : 1;
      return aExact - bExact || a.word.localeCompare(b.word);
    })
    .slice(0, 5);

  const addWord = (entry: WordEntry) => {
    onAdd({ id: entry.id, word: entry.word });
    setQuery('');
  };

  return (
    <div className="relation-picker">
      {selected.length > 0 && (
        <div className="relation-chips">
          {selected.map((word) => (
            <span className="relation-chip" key={word.id}>
              <span>{word.word}</span>
              <button
                type="button"
                onClick={() => onRemove(word.id)}
                aria-label={`移除关联词 ${word.word}`}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relation-search">
        <Search size={15} strokeWidth={1.8} aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const first = candidates[0];
              if (first) addWord(first);
            }
            if (event.key === 'Escape') setQuery('');
          }}
          placeholder={words.length ? '搜索并关联已有单词…' : '词库还空着，先记住当前这个词'}
          aria-label="关联已有单词"
          autoComplete="off"
          spellCheck={false}
          disabled={words.length === 0}
        />
        {query && (
          <button
            className="relation-search__clear"
            type="button"
            onClick={() => setQuery('')}
            aria-label="清空关联词搜索"
          >
            <X size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {needle && (
        <div className="relation-results">
          {candidates.length > 0 ? (
            candidates.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className="relation-result"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addWord(entry)}
              >
                <span className="relation-result__copy">
                  <span className="relation-result__word">{entry.word}</span>
                  <span className="relation-result__note">
                    {entry.note || entry.sentences[0] || '未填写联想'}
                  </span>
                </span>
                <Plus size={15} strokeWidth={1.8} />
              </button>
            ))
          ) : (
            <div className="relation-empty">
              <Check size={14} strokeWidth={1.8} />
              没有匹配的已收录单词
            </div>
          )}
        </div>
      )}
    </div>
  );
}
