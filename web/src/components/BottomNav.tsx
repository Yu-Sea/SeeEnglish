import type { TabId } from '../types';
import { NAV_ITEMS } from '../navigation';

interface BottomNavProps {
  activeTab: TabId;
  onNavigate: (tab: TabId) => void;
}

export function BottomNav({ activeTab, onNavigate }: BottomNavProps) {
  const activeIndex = Math.max(
    0,
    NAV_ITEMS.findIndex((item) => item.id === activeTab),
  );

  return (
    <nav className="dock" aria-label="主导航">
      <div className="dock__surface" role="tablist" aria-label="页面">
        <span
          className="dock__indicator"
          style={{ transform: `translate3d(${activeIndex * 100}%, 0, 0)` }}
          aria-hidden="true"
        />
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeTab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${item.label} · ${item.english}`}
              className={`dock__item ${isActive ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon className="dock__icon" strokeWidth={1.8} aria-hidden="true" />
              <span className="dock__label">{item.label}</span>
              <span className="dock__english">{item.english}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
