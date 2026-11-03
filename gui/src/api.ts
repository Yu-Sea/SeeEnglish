export interface RelatedWord {
  id: number;
  word: string;
}

export type MatchType = 'exact' | 'stored' | 'derived' | 'related' | 'prefix' | 'contains';

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
  last_result: 'correct' | 'incorrect' | null;
  archived: boolean;
  archived_at: string | null;
}

export interface WordMatch extends WordEntry {
  match_type: MatchType;
  relation_label: string;
  matched_form: string;
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

export interface ScoreTrendPoint {
  id: number;
  word_id: number;
  word: string;
  kind: string;
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

export interface DailyScorePoint {
  date: string;
  label: string;
  score: number;
  delta: number;
}

export interface Stats {
  words: number;
  sentences: number;
  forms: number;
  relations: number;
  with_notes: number;
  total_reviews: number;
  reviewed_words: number;
  archived_words: number;
  global_score: number;
  updated_at: string | null;
}

export interface ProfileResponse {
  library_id: number;
  stats: Stats;
  overview: GlobalOverview;
  daily: DailyScorePoint[];
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

export interface ReviewOutcome {
  result: 'correct' | 'incorrect';
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
  settlement: {
    kind: 'archive';
    score_before: number;
    score_after: number;
    delta: number;
    contribution_after: number;
    word_delta: number;
  };
}

export interface DeleteResponse {
  deleted: { id: number; word: string; contribution: number; score_after: number };
  overview: GlobalOverview;
}

export interface ImportResponse {
  imported: number;
  merged: number;
  total: number;
}

export interface CreateEntryPayload {
  word: string;
  sentence: string;
  note: string;
  related_ids: number[];
  source_form?: string;
}

export interface SupplementPayload {
  sentence: string;
  note: string;
  related_ids: number[];
  source_form?: string;
}

export interface WordUpdatePayload {
  word: string;
  note: string;
  sentences: string[];
  related_ids: number[];
}

const API_BASE = '';

interface ApiErrorDetail {
  message?: string;
  entry_id?: number;
}

export class ApiError extends Error {
  status: number;
  detail: ApiErrorDetail | string | null;

  constructor(status: number, detail: ApiErrorDetail | string | null) {
    super(
      typeof detail === 'string'
        ? detail
        : detail?.message || '本地 API 没有响应。',
    );
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, { message: '连接不到本地 API。' });
  }
  if (!response.ok) {
    let detail: ApiErrorDetail | string | null = null;
    try {
      const payload = (await response.json()) as { detail?: ApiErrorDetail | string };
      detail = payload.detail ?? null;
    } catch {
      detail = null;
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

function libraryQuery(libraryId: number, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ library_id: String(libraryId), ...extra });
  return params.toString();
}

export const api = {
  health: () => request<{ status: string }>('/api/health'),

  listLibraries: () => request<{ items: LibrarySummary[] }>('/api/libraries'),

  createLibrary: (payload: { name: string; group_name: string }) =>
    request<LibrarySummary>('/api/libraries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateLibrary: (libraryId: number, payload: { name: string; group_name: string }) =>
    request<LibrarySummary>(`/api/libraries/${libraryId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteLibrary: (libraryId: number) =>
    request<{ deleted: boolean }>(`/api/libraries/${libraryId}`, { method: 'DELETE' }),

  listWords: (libraryId: number, query = '', limit = 1000) =>
    request<{ items: WordEntry[]; total: number; query: string }>(
      `/api/words?q=${encodeURIComponent(query)}&limit=${limit}&${libraryQuery(libraryId)}`,
    ),

  match: (libraryId: number, query: string) =>
    request<{ query: string; matches: WordMatch[] }>(
      `/api/words/match?q=${encodeURIComponent(query)}&${libraryQuery(libraryId)}`,
    ),

  createWord: (libraryId: number, payload: CreateEntryPayload) =>
    request<WordEntry>(`/api/words?${libraryQuery(libraryId)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  supplementWord: (id: number, payload: SupplementPayload) =>
    request<WordEntry>(`/api/words/${id}/supplement`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateWord: (id: number, payload: WordUpdatePayload) =>
    request<WordEntry>(`/api/words/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteWord: (id: number) =>
    request<DeleteResponse>(`/api/words/${id}`, { method: 'DELETE' }),

  archiveWord: (id: number) =>
    request<ArchiveResponse>(`/api/words/${id}/archive`, { method: 'POST' }),

  unarchiveWord: (id: number) =>
    request<{ word: WordEntry; overview: GlobalOverview }>(
      `/api/words/${id}/unarchive`,
      { method: 'POST' },
    ),

  reviewOverview: (libraryId: number) =>
    request<GlobalOverview>(`/api/review/overview?${libraryQuery(libraryId)}`),

  reviewNext: (libraryId: number, excludeId?: number) =>
    request<ReviewNextResponse>(
      `/api/review/next?${libraryQuery(libraryId, excludeId ? { exclude_id: String(excludeId) } : undefined)}`,
    ),

  reviewWord: (id: number, payload: { result: 'correct' | 'incorrect'; answer: string }) =>
    request<ReviewResponse>(`/api/review/${id}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  profile: (libraryId: number) =>
    request<ProfileResponse>(`/api/profile?${libraryQuery(libraryId)}`),

  exportLibrary: async (libraryId: number) => {
    const response = await fetch(`/api/export?${libraryQuery(libraryId)}`);
    if (!response.ok) throw new ApiError(response.status, '导出失败。');
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'seeenglish-library.json';
    return { blob: await response.blob(), filename };
  },

  importLibrary: (libraryId: number, payload: unknown) =>
    request<ImportResponse>(`/api/import?${libraryQuery(libraryId)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
