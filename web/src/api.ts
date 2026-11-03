import type {
  ArchiveResponse,
  CreateEntryPayload,
  DeleteResponse,
  GlobalOverview,
  ImportResponse,
  LibraryListResponse,
  LibraryPayload,
  LibrarySummary,
  MatchResponse,
  ProfileResponse,
  ReviewNextResponse,
  ReviewResponse,
  ReviewSubmission,
  Stats,
  SupplementPayload,
  UnarchiveResponse,
  WordEntry,
  WordListResponse,
  WordUpdatePayload,
} from './types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

interface ErrorDetail {
  code?: string;
  message?: string;
  entry_id?: number;
}

export class ApiError extends Error {
  status: number;
  detail: ErrorDetail | string | null;

  constructor(status: number, detail: ErrorDetail | string | null) {
    super(
      typeof detail === 'string'
        ? detail
        : detail?.message || '本地 API 没有响应，请确认服务已经启动。',
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
    throw new ApiError(0, { message: '连接不到本地 API，请先运行 python app.py。' });
  }

  if (!response.ok) {
    let detail: ErrorDetail | string | null = null;
    try {
      const payload = (await response.json()) as { detail?: ErrorDetail | string };
      detail = payload.detail ?? null;
    } catch {
      detail = null;
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

export const api = {
  stats: (libraryId = 1) =>
    request<Stats>(`/api/stats?library_id=${encodeURIComponent(String(libraryId))}`),

  health: () => request<{ status: string }>('/api/health'),

  listLibraries: () => request<LibraryListResponse>('/api/libraries'),

  createLibrary: (payload: LibraryPayload) =>
    request<LibrarySummary>('/api/libraries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateLibrary: (libraryId: number, payload: LibraryPayload) =>
    request<LibrarySummary>(`/api/libraries/${libraryId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteLibrary: (libraryId: number) =>
    request<{ deleted: boolean; library_id: number }>(`/api/libraries/${libraryId}`, {
      method: 'DELETE',
    }),

  match: (query: string, libraryId = 1, signal?: AbortSignal) =>
    request<MatchResponse>(
      `/api/words/match?q=${encodeURIComponent(query)}&library_id=${encodeURIComponent(
        String(libraryId),
      )}`,
      { signal },
    ),

  listWords: (query = '', limit = 500, libraryId = 1) =>
    request<WordListResponse>(
      `/api/words?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(
        String(limit),
      )}&library_id=${encodeURIComponent(String(libraryId))}`,
    ),

  getWord: (id: number) => request<WordEntry>(`/api/words/${id}`),

  createWord: (payload: CreateEntryPayload, libraryId = 1) =>
    request<WordEntry>(
      `/api/words?library_id=${encodeURIComponent(String(libraryId))}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  supplementWord: (id: number, payload: SupplementPayload) =>
    request<WordEntry>(`/api/words/${id}/supplement`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  profile: (libraryId = 1) =>
    request<ProfileResponse>(
      `/api/profile?library_id=${encodeURIComponent(String(libraryId))}`,
    ),

  reviewOverview: (libraryId = 1) =>
    request<GlobalOverview>(
      `/api/review/overview?library_id=${encodeURIComponent(String(libraryId))}`,
    ),

  reviewNext: (libraryId = 1, excludeId?: number) => {
    const params = new URLSearchParams({ library_id: String(libraryId) });
    if (excludeId) params.set('exclude_id', String(excludeId));
    return request<ReviewNextResponse>(`/api/review/next?${params.toString()}`);
  },

  reviewWord: (id: number, payload: ReviewSubmission) =>
    request<ReviewResponse>(`/api/review/${id}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  archiveWord: (id: number) =>
    request<ArchiveResponse>(`/api/words/${id}/archive`, {
      method: 'POST',
    }),

  unarchiveWord: (id: number) =>
    request<UnarchiveResponse>(`/api/words/${id}/unarchive`, {
      method: 'POST',
    }),

  updateWord: (id: number, payload: WordUpdatePayload) =>
    request<WordEntry>(`/api/words/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteWord: (id: number) =>
    request<DeleteResponse>(`/api/words/${id}`, {
      method: 'DELETE',
    }),

  importLibrary: (payload: unknown, libraryId = 1) =>
    request<ImportResponse>(
      `/api/import?library_id=${encodeURIComponent(String(libraryId))}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  exportLibrary: async (
    libraryId = 1,
  ): Promise<{ blob: Blob; filename: string }> => {
    let response: Response;
    try {
      response = await fetch(
        `${API_BASE}/api/export?library_id=${encodeURIComponent(String(libraryId))}`,
      );
    } catch {
      throw new ApiError(0, { message: '连接不到本地 API，请先运行 python app.py。' });
    }
    if (!response.ok) {
      throw new ApiError(response.status, { message: '导出失败，请稍后再试。' });
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    return {
      blob: await response.blob(),
      filename: match?.[1] ?? 'seeenglish-library.json',
    };
  },
};
