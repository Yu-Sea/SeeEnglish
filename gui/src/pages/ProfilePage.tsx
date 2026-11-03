import {
  Camera,
  Check,
  ChevronRight,
  ExternalLink,
  Fingerprint,
  Gauge,
  HardDrive,
  Info,
  LibraryBig,
  LoaderCircle,
  Palette,
  Pencil,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { DailyScorePoint, LibrarySummary, ProfileResponse } from '../api';
import type { GuiPreferences, ToneId } from '../preferences';
import { toneOptions } from '../data';

interface ProfilePageProps {
  library: LibrarySummary;
  refreshKey: number;
  immersive: boolean;
  preferences: GuiPreferences;
  onPreferencesChange: (preferences: GuiPreferences) => void;
  onNavigate: (page: 'capture' | 'review' | 'library' | 'profile') => void;
  onOpenWeb: () => void;
  onToast: (message: string) => void;
}

const PROFILE_KEY = 'seeenglish.gui.profile.v1';
const ART_SUPPORT = '@xxxx（B站）';

interface LocalProfile {
  name: string;
  signature: string;
}

function loadProfile(): LocalProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return { name: 'SeeEnglish', signature: 'A word after a word after a word is power.' };
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'SeeEnglish',
      signature:
        typeof parsed.signature === 'string'
          ? parsed.signature
          : 'A word after a word after a word is power.',
    };
  } catch {
    return { name: 'SeeEnglish', signature: 'A word after a word after a word is power.' };
  }
}

const chartWidth = 520;
const chartHeight = 142;

function TrendChart({ points }: { points: DailyScorePoint[] }) {
  if (points.length === 0) {
    return <div className="trend-empty">还没有可以展示的结算记录。</div>;
  }
  const values = points.map((point) => point.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(0.001, max - min);
  const line = points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * chartWidth;
      const y = chartHeight - ((point.score - min) / spread) * (chartHeight - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const lastY = Number(line.split(' ').at(-1)?.split(',')[1] ?? 0);
  return (
    <svg className="trend-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="最近 30 天分数变化">
      {[0, 1, 2, 3].map((index) => (
        <line
          key={index}
          x1="0"
          x2={chartWidth}
          y1={(chartHeight / 3) * index}
          y2={(chartHeight / 3) * index}
          className="trend-chart__grid"
        />
      ))}
      <polyline points={line} className="trend-chart__line" />
      <circle cx={chartWidth} cy={lastY} r="4" className="trend-chart__dot" />
      <text x="4" y="13" className="trend-chart__label">
        {max.toFixed(2)}
      </text>
      <text x="4" y={chartHeight - 5} className="trend-chart__label">
        {min.toFixed(2)}
      </text>
      <text x={chartWidth} y={chartHeight - 5} textAnchor="end" className="trend-chart__label">
        今天 · {points.at(-1)?.score.toFixed(3)}
      </text>
    </svg>
  );
}

export function ProfilePage({
  library,
  refreshKey,
  immersive,
  preferences,
  onPreferencesChange,
  onNavigate,
  onOpenWeb,
  onToast,
}: ProfilePageProps) {
  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior | null>(null);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<LocalProfile>(loadProfile);
  const [editing, setEditing] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name);
  const [signatureDraft, setSignatureDraft] = useState(profile.signature);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .profile(library.id)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError('读取学习数据失败，请确认本地 API 正在运行。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [library.id, refreshKey]);

  const overview = data?.overview;
  const score = overview?.score ?? library.score;
  const totalWords = overview?.total_words ?? library.word_count;
  const archived = overview?.archived_words ?? library.archived_count;
  const archivePercent = totalWords > 0 ? (archived / totalWords) * 100 : 0;
  const webUrl = `${window.location.origin}/`;

  useEffect(() => {
    if (!window.seeEnglish) return;
    let active = true;
    void window.seeEnglish
      .getCloseBehavior()
      .then((value) => {
        if (active) setCloseBehavior(value);
      })
      .catch(() => {
        if (active) setCloseBehavior(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const changeCloseBehavior = async (value: CloseBehavior) => {
    if (!window.seeEnglish) return;
    const saved = await window.seeEnglish.setCloseBehavior(value);
    setCloseBehavior(saved);
  };

  const changePreference = <K extends keyof GuiPreferences>(key: K, value: GuiPreferences[K]) => {
    onPreferencesChange({ ...preferences, [key]: value });
  };

  const saveProfile = () => {
    const next = {
      name: nameDraft.trim() || 'SeeEnglish',
      signature: signatureDraft.trim(),
    };
    setProfile(next);
    try {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    } catch {
      // Local profile is a convenience.
    }
    setEditing(false);
    onToast('个人资料已保存');
  };

  return (
    <section className="page page--profile">
      {immersive && (
        <div className="immersive-tools">
          <button type="button" className="library-chip" onClick={onOpenWeb}>
            <ExternalLink size={13} strokeWidth={1.8} />
            Web 端
          </button>
          <button type="button" className="immersive-tools__icon" onClick={() => setEditing(true)} title="编辑资料">
            <Pencil size={15} strokeWidth={1.8} />
          </button>
        </div>
      )}

      <header className="page-heading">
        <div>
          <div className="eyebrow">
            <span />
            PROFILE · 04
          </div>
          <h1>看见变化，但不被变化催促。</h1>
          <p>这里没有排行榜。只有你的进度、最近 30 天的曲线，和一些让界面更舒服的偏好。</p>
        </div>
        <div className="page-heading__actions">
          <button type="button" className="library-chip" onClick={() => onNavigate('library')}>
            <LibraryBig size={14} strokeWidth={1.8} />
            {library.name}
            <ChevronRight size={12} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {error && <div className="page-alert">{error}</div>}

      <article className="profile-hero panel">
        <div className="profile-avatar">
          <Fingerprint size={37} strokeWidth={1.35} />
          <button type="button" aria-label="更换头像" onClick={() => onToast('头像功能将在后续接入')}>
            <Camera size={13} strokeWidth={1.9} />
          </button>
        </div>
        <div className="profile-identity">
          <span className="panel-kicker">LOCAL ACCOUNT · 本地账户</span>
          <h2>{profile.name}</h2>
          <p>{profile.signature || 'A word after a word after a word is power.'}</p>
          <div className="profile-meta">
            <span>
              <HardDrive size={12} strokeWidth={1.7} />
              数据仅保存在本机
            </span>
            <span>
              <ShieldCheck size={12} strokeWidth={1.7} />
              无需登录
            </span>
            <span className="online">
              <i />
              本地 API
            </span>
          </div>
        </div>
        <button type="button" className="button button--outline" onClick={() => setEditing(true)}>
          <Pencil size={14} strokeWidth={1.8} />
          编辑资料
        </button>
      </article>

      <div className="profile-dashboard">
        <article className="profile-progress panel">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">LEARNING PROGRESS</span>
              <h2>当前词库 · {library.name}</h2>
            </div>
            <span className="score-level">{loading ? '读取中' : overview?.level ?? '—'}</span>
          </div>
          <div className="profile-score">
            <b>{score.toFixed(3)}</b>
            <span>总掌握分</span>
          </div>
          <p className="profile-score-note">100 分约为 CET-4 水平 · 不设上限</p>
          <div className="profile-archive">
            <div>
              <span>已归档</span>
              <b>
                {archived} <i>/ {totalWords}</i>
              </b>
            </div>
            <div className="profile-archive__track">
              <span style={{ width: `${archivePercent}%` }} />
            </div>
          </div>
          <div className="profile-metrics">
            <div>
              <span>WORDS</span>
              <b>{totalWords}</b>
              <small>词条</small>
            </div>
            <div>
              <span>REVIEWS</span>
              <b>{overview?.total_reviews ?? 0}</b>
              <small>次见面</small>
            </div>
            <div>
              <span>SETTLED</span>
              <b>{overview?.settlement_count ?? 0}</b>
              <small>次结算</small>
            </div>
            <div>
              <span>ARCHIVED</span>
              <b>{archived}</b>
              <small>已归档</small>
            </div>
          </div>
        </article>

        <article className="profile-trend panel">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">SCORE TREND · 30 DAYS</span>
              <h2>最近的形状</h2>
            </div>
            <span className="profile-trend__value">{score.toFixed(3)}</span>
          </div>
          <p className="profile-trend__copy">最近 30 天的总分变化，只记录结算和归档。</p>
          {loading ? (
            <div className="trend-empty">
              <LoaderCircle className="spin" size={16} strokeWidth={1.8} />
              正在读取趋势…
            </div>
          ) : (
            <TrendChart points={data?.daily ?? []} />
          )}
        </article>
      </div>

      <div className="profile-settings panel">
        <div className="panel-head">
          <div>
            <span className="panel-kicker">SETTINGS · 设置</span>
            <h2>让界面更像你的。</h2>
          </div>
          <span className="settings-hint">所有偏好留在本机</span>
        </div>

        <div className="settings-grid">
          <div className="settings-column">
            <div className="settings-row">
              <span className="settings-row__icon">
                <Palette size={16} strokeWidth={1.7} />
              </span>
              <div className="settings-row__body">
                <b>字色</b>
                <div className="tone-row">
                  {toneOptions.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      className={preferences.tone === option.id ? 'is-active' : ''}
                      onClick={() => changePreference('tone', option.id as ToneId)}
                      title={option.label}
                    >
                      <i style={{ background: option.color }} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="settings-row">
              <span className="settings-row__icon">
                <Gauge size={16} strokeWidth={1.7} />
              </span>
              <div className="settings-row__body settings-row__body--split">
                <div>
                  <b>界面动效</b>
                  <small>页面切换与细节反馈</small>
                </div>
                <div className="motion-switch">
                  <button
                    type="button"
                    className={preferences.motion === 'standard' ? 'is-active' : ''}
                    onClick={() => changePreference('motion', 'standard')}
                  >
                    标准
                  </button>
                  <button
                    type="button"
                    className={preferences.motion === 'reduced' ? 'is-active' : ''}
                    onClick={() => changePreference('motion', 'reduced')}
                  >
                    精简
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-row">
              <span className="settings-row__icon">
                <Sparkles size={16} strokeWidth={1.7} />
              </span>
              <div className="settings-row__body settings-row__body--split">
                <div>
                  <b>背景装饰</b>
                  <small>蓝色的点阵和轻微的环境光</small>
                </div>
                <button
                  type="button"
                  className={`toggle ${preferences.floaters ? 'is-on' : ''}`}
                  aria-pressed={preferences.floaters}
                  onClick={() => changePreference('floaters', !preferences.floaters)}
                >
                  <span />
                </button>
              </div>
            </div>

            <div className="settings-row">
              <span className="settings-row__icon">
                <Sparkles size={16} strokeWidth={1.7} />
              </span>
              <div className="settings-row__body settings-row__body--split">
                <div>
                  <b>沉浸模式</b>
                  <small>去掉页头，把空间留给卡片和内容</small>
                </div>
                <button
                  type="button"
                  className={`toggle ${preferences.immersive ? 'is-on' : ''}`}
                  aria-pressed={preferences.immersive}
                  onClick={() => changePreference('immersive', !preferences.immersive)}
                >
                  <span />
                </button>
              </div>
            </div>

            {closeBehavior && (
              <div className="settings-row">
                <span className="settings-row__icon">
                  <X size={16} strokeWidth={1.7} />
                </span>
                <div className="settings-row__body settings-row__body--split">
                  <div>
                    <b>关闭窗口时</b>
                    <small>最小化后 API 和数据仍在后台运行</small>
                  </div>
                  <div className="motion-switch close-behavior-switch">
                    <button
                      type="button"
                      className={closeBehavior === 'ask' ? 'is-active' : ''}
                      onClick={() => void changeCloseBehavior('ask')}
                    >
                      每次询问
                    </button>
                    <button
                      type="button"
                      className={closeBehavior === 'tray' ? 'is-active' : ''}
                      onClick={() => void changeCloseBehavior('tray')}
                    >
                      最小化
                    </button>
                    <button
                      type="button"
                      className={closeBehavior === 'quit' ? 'is-active' : ''}
                      onClick={() => void changeCloseBehavior('quit')}
                    >
                      退出
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="settings-column">
            <div className="web-card">
              <div className="web-card__head">
                <span className="panel-kicker">WEB VERSION</span>
                <b>Web 端地址</b>
              </div>
              <button type="button" className="web-address" onClick={onOpenWeb}>
                <span>{webUrl}</span>
                <ExternalLink size={14} strokeWidth={1.8} />
              </button>
              <p>点击网址会在浏览器打开 Web 版，桌面窗口继续保留。</p>
            </div>

            <div className="settings-links">
              <button type="button" onClick={() => onToast('AI 配置将在后续接入')}>
                <span>
                  <Sparkles size={15} strokeWidth={1.7} />
                </span>
                <div>
                  <b>AI 配置</b>
                  <small>训练模式与探索模式</small>
                </div>
                <span className="settings-soon">待开放</span>
                <ChevronRight size={14} strokeWidth={1.7} />
              </button>
              <button type="button" onClick={() => setAboutOpen(true)}>
                <span>
                  <Info size={15} strokeWidth={1.7} />
                </span>
                <div>
                  <b>关于</b>
                  <small>版本、技术与本地数据</small>
                </div>
                <ChevronRight size={14} strokeWidth={1.7} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true">
            <header className="dialog__head">
              <div>
                <span className="panel-kicker">EDIT PROFILE</span>
                <h2>编辑资料</h2>
              </div>
              <button type="button" className="dialog__close" onClick={() => setEditing(false)} aria-label="关闭">
                <X size={16} strokeWidth={1.8} />
              </button>
            </header>
            <div className="dialog__body dialog-form">
              <label className="field">
                <span>名字</span>
                <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={40} />
              </label>
              <label className="field">
                <span>签名</span>
                <textarea
                  value={signatureDraft}
                  onChange={(event) => setSignatureDraft(event.target.value)}
                  rows={3}
                  maxLength={200}
                />
              </label>
              <div className="dialog-actions">
                <button type="button" className="button button--ghost" onClick={() => setEditing(false)}>
                  取消
                </button>
                <button type="button" className="button button--primary" onClick={saveProfile}>
                  <Check size={15} strokeWidth={2} />
                  保存资料
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {aboutOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAboutOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true">
            <header className="dialog__head">
              <div>
                <span className="panel-kicker">ABOUT · 见词</span>
                <h2>关于 SeeEnglish</h2>
              </div>
              <button type="button" className="dialog__close" onClick={() => setAboutOpen(false)} aria-label="关闭">
                <X size={16} strokeWidth={1.8} />
              </button>
            </header>
            <div className="dialog__body">
              <div className="gui-about">
                <div className="gui-about__brand">
                  <span className="gui-about__mark">
                    <Fingerprint size={20} strokeWidth={1.5} />
                  </span>
                  <div>
                    <b>SeeEnglish</b>
                    <span>见词 · 本地优先的英语语言索引</span>
                  </div>
                </div>
                <div className="gui-about__rows">
                  <div>
                    <span>版本</span>
                    <b>0.6.0</b>
                  </div>
                  <div>
                    <span>数据</span>
                    <b>%APPDATA%\SeeEnglish\seeenglish.db</b>
                  </div>
                  <div>
                    <span>技术栈</span>
                    <b>React · FastAPI · SQLite</b>
                  </div>
                  <div className="gui-about__art">
                    <span>美术支持</span>
                    <b>{ART_SUPPORT}</b>
                  </div>
                </div>
                <p className="gui-about__note">所有词库、复习记录和设置都只保存在本机。</p>
                <div className="dialog-actions">
                  <button type="button" className="button button--primary" onClick={() => setAboutOpen(false)}>
                    知道了
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
