export type TabId = 'add' | 'review' | 'library' | 'profile';

export type MatchType = 'exact' | 'stored' | 'derived' | 'related' | 'prefix' | 'contains';

export interface RelatedWord {
  id: number;
  word: string;
}

export type ReviewResult = 'correct' | 'incorrect';
export type ScoreEventKind = 'review' | 'archive' | 'delete' | 'import';

export interface WordEntry {
  id: number;
  library_id: number;
  word: string;
  forms: string[];
  sentences: string[];
  note: string;
  related: RelatedWord[];
  created_at: string;
  updated_at: string;
  contribution: number;
  review_count: number;
  correct_count: number;
  accuracy: number | null;
  block_correct: number;
  block_reviews: number;
  block_position: number;
  last_block_accuracy: number | null;
  last_block_delta: number | null;
  last_reviewed_at: string | null;
  last_result: ReviewResult | null;
  archived: boolean;
  archived_at: string | null;
}

export interface WordMatch extends WordEntry {
  match_type: MatchType;
  relation_label: string;
  matched_form: string;
}

export interface ScoreTrendPoint {
  id: number;
  word_id: number;
  word: string;
  kind: ScoreEventKind;
  correct: number | null;
  total: number | null;
  delta: number;
  contribution_after: number;
  score_after: number;
  created_at: string;
}

export interface GlobalOverview {
  library_id: number;
  score: number;
  level: string;
  score_progress: number;
  total_words: number;
  archived_words: number;
  total_reviews: number;
  settlement_count: number;
  max_word_contribution: number;
  trend: ScoreTrendPoint[];
}

export interface BlockSettlement {
  block_number: number;
  accuracy: number;
  correct: number;
  total: number;
  word_delta: number;
  score_delta: number;
  score_after: number;
  label: string;
}

export interface ArchiveSettlement {
  kind: 'archive';
  score_before: number;
  score_after: number;
  delta: number;
  contribution_after: number;
  word_delta: number;
}

export interface ReviewOutcome {
  result: ReviewResult;
  score_before: number;
  score_after: number;
  delta: number;
  block_settlement: BlockSettlement | null;
  word_contribution_before: number;
  word_contribution_after: number;
  block_index: number;
}

export interface ReviewNextResponse {
  word: WordEntry;
  pool_size: number;
  overview: GlobalOverview;
}

export interface ReviewResponse {
  word: WordEntry;
  outcome: ReviewOutcome;
  overview: GlobalOverview;
}

export interface ArchiveResponse {
  word: WordEntry;
  overview: GlobalOverview;
  settlement: ArchiveSettlement;
}

export interface UnarchiveResponse {
  word: WordEntry;
  overview: GlobalOverview;
}

export interface DeleteResponse {
  deleted: {
    id: number;
    word: string;
    contribution: number;
    score_after: number;
  };
  overview: GlobalOverview;
}

export interface WordUpdatePayload {
  word: string;
  note: string;
  sentences: string[];
  related_ids: number[];
}

export interface DailyScorePoint {
  date: string;
  label: string;
  score: number;
  delta: number;
}

export interface ProfileResponse {
  library_id: number;
  stats: Stats;
  overview: GlobalOverview;
  daily: DailyScorePoint[];
}

export interface LibrarySummary {
  id: number;
  name: string;
  group_name: string;
  is_default: boolean;
  word_count: number;
  sentence_count: number;
  archived_count: number;
  score: number;
  created_at: string;
  updated_at: string;
}

export interface LibraryListResponse {
  items: LibrarySummary[];
}

export interface LibraryPayload {
  name: string;
  group_name: string;
}

export interface ImportResponse {
  imported: number;
  merged: number;
  total: number;
}

export interface ReviewSubmission {
  result: ReviewResult;
  answer: string;
}

export interface Stats {
  library_id?: number;
  words: number;
  sentences: number;
  forms: number;
  relations: number;
  with_notes: number;
  total_reviews?: number;
  reviewed_words?: number;
  archived_words?: number;
  global_score?: number;
  updated_at: string | null;
}

export interface MatchResponse {
  query: string;
  matches: WordMatch[];
}

export interface WordListResponse {
  items: WordEntry[];
  total: number;
  query: string;
}

export interface EntryDraft {
  sentence: string;
  note: string;
  related_ids: number[];
}

export interface CreateEntryPayload extends EntryDraft {
  word: string;
  source_form?: string;
}

export interface SupplementPayload extends EntryDraft {
  source_form?: string;
}
