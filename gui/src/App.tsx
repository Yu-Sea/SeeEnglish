import {
  CircleHelp,
  ExternalLink,
  LibraryBig,
  PenLine,
  RotateCcw,
  Settings2,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { LibrarySummary } from './api';
import {
  applyGuiPreferences,
  loadGuiPreferences,
  saveGuiPreferences,
} from './preferences';
import type { GuiPreferences } from './preferences';
import { CapturePage } from './pages/CapturePage';
import { LibraryPage } from './pages/LibraryPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReviewPage } from './pages/ReviewPage';

type PageId = 'capture' | 'review' | 'library' | 'profile';
type ApiStatus = 'checking' | 'online' | 'offline';

const LIBRARY_KEY = 'seeenglish.gui.library.v1';

const PAGE_META: Record<
  PageId,
  { index: string; label: string; english: string; title: string }
> = {
  capture: { index: '01', label: '记词', english: 'CAPTURE', title: '把遇见留下。' },
  review: { index: '02', label: '复习', english: 'REVIEW', title: '让记忆再回来。' },
  library: { index: '03', label: '词库', english: 'LIBRARY', title: '你的语言索引。' },
  profile: { index: '04', label: '个人', english: 'PROFILE', title: '看见自己的变化。' },
};

const NAV_ITEMS: { id: PageId; icon: ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'capture', icon: PenLine },
  { id: 'review', icon: RotateCcw },
  { id: 'library', icon: LibraryBig },
  { id: 'profile', icon: UserRound },
];

const EMPTY_LIBRARY: LibrarySummary = {
  id: 1,
  name: '默认词库',
  group_name: '未分组',
  is_default: true,
  word_count: 0,
  sentence_count: 0,
  archived_count: 0,
  score: 0,
  created_at: '',
  updated_at: '',
};

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span>S</span>
      <i />
    </span>
  );
}

function Sidebar({
  page,
  onNavigate,
  apiStatus,
  onOpenWeb,
  onSettings,
  immersive,
  onExitImmersive,
}: {
  page: PageId;
  onNavigate: (page: PageId) => void;
  apiStatus: ApiStatus;
  onOpenWeb: () => void;
  onSettings: () => void;
  immersive: boolean;
  onExitImmersive: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <BrandMark />
        <div>
          <b>SeeEnglish</b>
          <span>见词 · 语言索引</span>
        </div>
      </div>

      <div className="sidebar__rule" />

      <div className="sidebar__label">WORKSPACE</div>
      <nav className="sidebar__nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => {
          const meta = PAGE_META[item.id];
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${page === item.id ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <span className="nav-item__num">{meta.index}</span>
              <Icon size={17} strokeWidth={1.75} />
              <span className="nav-item__label">{meta.label}</span>
              <span className="nav-item__english">{meta.english}</span>
              <span className="nav-item__dot" aria-hidden="true" />
            </button>
          );
        })}
      </nav>

      <div className="sidebar__spacer" />

      <div className="sidebar__note">
        <span className="sidebar__note-mark">S</span>
        <p>没有每日任务，也没有倒计时。只留下你真正想记住的词。</p>
      </div>

      <div className="sidebar__foot">
        <div className={`api-chip ${apiStatus}`}>
          {apiStatus === 'offline' ? (
            <WifiOff size={13} strokeWidth={1.8} />
          ) : (
            <Wifi size={13} strokeWidth={1.8} />
          )}
          <span>
            {apiStatus === 'checking'
              ? '连接本地 API'
              : apiStatus === 'online'
                ? '本地 API · 已连接'
                : '本地 API · 离线'}
          </span>
          <i />
        </div>
        {immersive && (
          <button type="button" className="sidebar__exit-immersive" onClick={onExitImmersive}>
            退出沉浸
          </button>
        )}
        <div className="sidebar__actions">
          <button type="button" onClick={onOpenWeb}>
            <ExternalLink size={13} strokeWidth={1.8} />
            Web 版
          </button>
          <button type="button" onClick={onSettings} aria-label="设置">
            <Settings2 size={14} strokeWidth={1.8} />
          </button>
        </div>
        <span className="sidebar__version">DESKTOP · 0.2</span>
      </div>
    </aside>
  );
}

function Topbar({ page, apiStatus }: { page: PageId; apiStatus: ApiStatus }) {
  const meta = PAGE_META[page];
  return (
    <header className="topbar">
      <div className="topbar__breadcrumb">
        <span>WORKSPACE</span>
        <i />
        <b>
          {meta.index} · {meta.english}
        </b>
      </div>
      <div className="topbar__right">
        <span className={`topbar__status ${apiStatus}`}>
          <i />
          {apiStatus === 'online' ? 'LOCAL' : apiStatus === 'offline' ? 'OFFLINE' : 'CONNECTING'}
        </span>
        <button type="button" className="topbar__help" aria-label="界面说明">
          <CircleHelp size={15} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}

export default function App() {
  const [page, setPage] = useState<PageId>('capture');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [currentLibraryId, setCurrentLibraryId] = useState(() => {
    const value = Number(window.localStorage.getItem(LIBRARY_KEY));
    return Number.isInteger(value) && value > 0 ? value : 1;
  });
  const [preferences, setPreferences] = useState<GuiPreferences>(loadGuiPreferences);
  const [refreshKey, setRefreshKey] = useState(0);
  const [focusWordId, setFocusWordId] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [toastTimer, setToastTimer] = useState<number | null>(null);

  const currentLibrary =
    libraries.find((library) => library.id === currentLibraryId) ??
    libraries.find((library) => library.is_default) ??
    libraries[0] ??
    EMPTY_LIBRARY;

  const loadLibraries = useCallback(async () => {
    const data = await api.listLibraries();
    setLibraries(data.items);
    setCurrentLibraryId((current) => {
      if (data.items.some((library) => library.id === current)) return current;
      return (
        data.items.find((library) => library.is_default)?.id ??
        data.items[0]?.id ??
        current
      );
    });
    return data.items;
  }, []);

  useEffect(() => {
    applyGuiPreferences(preferences);
    saveGuiPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LIBRARY_KEY, String(currentLibraryId));
    } catch {
      // The selected library is a convenience.
    }
  }, [currentLibraryId]);

  useEffect(() => {
    let active = true;
    api
      .health()
      .then(() => {
        if (active) setApiStatus('online');
      })
      .catch(() => {
        if (active) setApiStatus('offline');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadLibraries().catch(() => setApiStatus('offline'));
  }, [loadLibraries, refreshKey]);

  useEffect(() => {
    return () => {
      if (toastTimer !== null) window.clearTimeout(toastTimer);
    };
  }, [toastTimer]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    const timer = window.setTimeout(() => {
      setToast('');
      setToastTimer(null);
    }, 2800);
    setToastTimer(timer);
  };

  const refresh = () => setRefreshKey((value) => value + 1);

  const navigate = (next: PageId) => {
    if (next !== 'library') setFocusWordId(null);
    if (next === page) return;
    setPage(next);
    document.querySelector('.workspace__main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openRelatedWord = (wordId: number) => {
    setFocusWordId(wordId);
    navigate('library');
  };

  const clearFocusWord = useCallback(() => {
    setFocusWordId(null);
  }, []);

  const selectLibrary = (libraryId: number) => {
    setCurrentLibraryId(libraryId);
    setFocusWordId(null);
    const library = libraries.find((item) => item.id === libraryId);
    if (library) showToast(`已切换到「${library.name}」`);
    refresh();
  };

  const addLibrary = async (name: string, group: string) => {
    const created = await api.createLibrary({
      name,
      group_name: group || '未分组',
    });
    const items = await loadLibraries();
    refresh();
    return items.find((library) => library.id === created.id) ?? created;
  };

  const updateLibrary = async (libraryId: number, name: string, group: string) => {
    const updated = await api.updateLibrary(libraryId, {
      name,
      group_name: group || '未分组',
    });
    const items = await loadLibraries();
    refresh();
    return items.find((library) => library.id === updated.id) ?? updated;
  };

  const deleteLibrary = async (libraryId: number) => {
    await api.deleteLibrary(libraryId);
    const items = await loadLibraries();
    if (currentLibraryId === libraryId) {
      const fallback = items.find((library) => library.is_default) ?? items[0];
      if (fallback) setCurrentLibraryId(fallback.id);
    }
    refresh();
  };

  const openWeb = () => {
    window.open('/', '_blank', 'noopener,noreferrer');
  };

  const pageProps = {
    onToast: showToast,
    onNavigate: navigate,
    onChanged: refresh,
    immersive: preferences.immersive,
  };

  return (
    <div className={`gui-shell ${preferences.immersive ? 'is-immersive' : ''}`}>
      <Sidebar
        page={page}
        onNavigate={navigate}
        apiStatus={apiStatus}
        onOpenWeb={openWeb}
        onSettings={() => navigate('profile')}
        immersive={preferences.immersive}
        onExitImmersive={() =>
          setPreferences((current) => ({ ...current, immersive: false }))
        }
      />

      <div className="workspace">
        <Topbar page={page} apiStatus={apiStatus} />
        <main className="workspace__main">
          <div className="page-frame" key={page}>
            {page === 'capture' && (
              <CapturePage
                {...pageProps}
                library={currentLibrary}
                refreshKey={refreshKey}
              />
            )}
            {page === 'review' && (
              <ReviewPage
                {...pageProps}
                library={currentLibrary}
                onOpenRelated={openRelatedWord}
              />
            )}
            {page === 'library' && (
              <LibraryPage
                {...pageProps}
                libraries={libraries}
                library={currentLibrary}
                refreshKey={refreshKey}
                onSelectLibrary={selectLibrary}
                onAddLibrary={addLibrary}
                onUpdateLibrary={updateLibrary}
                onDeleteLibrary={deleteLibrary}
                focusWordId={focusWordId}
                onFocusWordConsumed={clearFocusWord}
                onOpenRelated={openRelatedWord}
              />
            )}
            {page === 'profile' && (
              <ProfilePage
                {...pageProps}
                library={currentLibrary}
                refreshKey={refreshKey}
                preferences={preferences}
                onPreferencesChange={setPreferences}
                onOpenWeb={openWeb}
              />
            )}
          </div>
        </main>
      </div>

      {toast && (
        <div className="toast" role="status">
          <span className="toast__dot" />
          {toast}
        </div>
      )}
    </div>
  );
}
