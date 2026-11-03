import type { Stats, TabId } from '../types';
import { navItemFor } from '../navigation';

interface TopBarProps {
  activeTab: TabId;
  apiOnline: boolean | null;
  stats: Stats | null;
}

export function TopBar({ activeTab, apiOnline, stats }: TopBarProps) {
  const current = navItemFor(activeTab);
  const status =
    apiOnline === null ? 'CONNECTING' : apiOnline ? 'LOCAL API' : 'API OFFLINE';

  return (
    <header className="topbar">
      <div className="topbar__meta">
        <span className="topbar__counter" aria-label={`第 ${current.index} 个页面，共 4 个`}>
          {current.index} <span>/ 04</span>
        </span>
        <span className="topbar__divider" />
        <span className={`status-pill ${apiOnline === false ? 'is-offline' : ''}`}>
          <span className="status-pill__dot" />
          <span>{status}</span>
        </span>
        {stats && (
          <span className="topbar__words" aria-label={`共 ${stats.words} 个词条`}>
            {String(stats.words).padStart(2, '0')} <span>WORDS</span>
          </span>
        )}
      </div>
    </header>
  );
}
