import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Backdrop } from './components/Backdrop';
import { BottomNav } from './components/BottomNav';
import { TopBar } from './components/TopBar';
import { AddPage } from './pages/AddPage';
import { LibraryPage } from './pages/LibraryPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReviewPage } from './pages/ReviewPage';
import type { Preferences } from './preferences';
import { applyPreferences, loadPreferences, savePreferences } from './preferences';
import type { LibrarySummary, Stats, TabId, WordEntry } from './types';

const LEAVE_DURATION = 170;
const LIBRARY_STORAGE_KEY = 'seeenglish.currentLibrary.v1';

function loadCurrentLibraryId(): number {
  try {
    const value = Number(window.localStorage.getItem(LIBRARY_STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

function saveCurrentLibraryId(libraryId: number): void {
  try {
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, String(libraryId));
  } catch {
    // The selected library is a convenience; storage failures are non-fatal.
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('add');
  const [visibleTab, setVisibleTab] = useState<TabId>('add');
  const [leaving, setLeaving] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [currentLibraryId, setCurrentLibraryId] = useState(loadCurrentLibraryId);
  const [focusWordId, setFocusWordId] = useState<number | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const timerRef = useRef<number | null>(null);

  const currentLibrary =
    libraries.find((library) => library.id === currentLibraryId) ??
    libraries.find((library) => library.is_default) ??
    null;

  const reloadLibraries = useCallback(async () => {
    const data = await api.listLibraries();
    setLibraries(data.items);
    setCurrentLibraryId((current) => {
      const stillExists = data.items.some((library) => library.id === current);
      if (stillExists) return current;
      return (
        data.items.find((library) => library.is_default)?.id ??
        data.items[0]?.id ??
        current
      );
    });
    return data.items;
  }, []);

  useEffect(() => {
    applyPreferences(preferences);
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    saveCurrentLibraryId(currentLibraryId);
  }, [currentLibraryId]);

  useEffect(() => {
    void reloadLibraries().catch(() => {
      // Pages show their own offline state; the shell can still render.
    });
  }, [reloadLibraries, refreshTick]);

  useEffect(() => {
    let active = true;
    api
      .stats(currentLibraryId)
      .then((nextStats) => {
        if (!active) return;
        setStats(nextStats);
        setApiOnline(true);
      })
      .catch(() => {
        if (!active) return;
        setApiOnline(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTick, currentLibraryId]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const navigate = (next: TabId) => {
    if (next !== 'library') setFocusWordId(null);
    if (next === activeTab) return;
    setActiveTab(next);
    setLeaving(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setVisibleTab(next);
      setLeaving(false);
      timerRef.current = null;
      window.scrollTo(0, 0);
    }, LEAVE_DURATION);
  };

  const handleSaved = (_entry: WordEntry) => {
    setRefreshTick((value) => value + 1);
  };

  const handleDataChanged = () => {
    setRefreshTick((value) => value + 1);
  };

  const handleSelectLibrary = (libraryId: number) => {
    setCurrentLibraryId(libraryId);
    setFocusWordId(null);
    setRefreshTick((value) => value + 1);
  };

  const openRelatedWord = (wordId: number) => {
    setFocusWordId(wordId);
    navigate('library');
  };

  const clearFocusWord = useCallback(() => {
    setFocusWordId(null);
  }, []);

  let page;
  switch (visibleTab) {
    case 'review':
      page = (
        <ReviewPage
          key={`review-${currentLibraryId}`}
          stats={stats}
          libraryId={currentLibraryId}
          immersive={preferences.immersive}
          onNavigate={navigate}
          onOpenRelated={openRelatedWord}
        />
      );
      break;
    case 'library':
      page = (
        <LibraryPage
          key={currentLibraryId}
          refreshKey={refreshTick}
          libraryId={currentLibraryId}
          libraries={libraries}
          currentLibrary={currentLibrary}
          onSelectLibrary={handleSelectLibrary}
          onLibrariesChanged={reloadLibraries}
          immersive={preferences.immersive}
          layout={preferences.libraryLayout}
          onLayoutChange={(libraryLayout) =>
            setPreferences((current) => ({ ...current, libraryLayout }))
          }
          onNavigate={navigate}
          onOpenRelated={openRelatedWord}
          focusWordId={focusWordId}
          onFocusWordConsumed={clearFocusWord}
          onChanged={handleDataChanged}
        />
      );
      break;
    case 'profile':
      page = (
        <ProfilePage
          key={currentLibraryId}
          refreshKey={refreshTick}
          libraryId={currentLibraryId}
          libraryName={currentLibrary?.name ?? '默认词库'}
          apiOnline={apiOnline}
          preferences={preferences}
          onPreferencesChange={setPreferences}
        />
      );
      break;
    case 'add':
    default:
      page = (
        <AddPage
          libraryId={currentLibraryId}
          libraryName={currentLibrary?.name ?? '默认词库'}
          onSaved={handleSaved}
          onNavigate={navigate}
        />
      );
      break;
  }

  return (
    <div className="app">
      <Backdrop />
      <TopBar activeTab={activeTab} apiOnline={apiOnline} stats={stats} />
      <main className="app-main">
        <div
          key={visibleTab}
          className={`page-frame ${leaving ? 'is-leaving' : 'is-entering'}`}
        >
          {page}
        </div>
      </main>
      <BottomNav activeTab={activeTab} onNavigate={navigate} />
    </div>
  );
}
