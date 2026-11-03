import {
  Camera,
  Check,
  ChevronRight,
  EyeOff,
  Fingerprint,
  Gauge,
  HardDrive,
  Info,
  LibraryBig,
  MoreHorizontal,
  Palette,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import type { DailyScorePoint, ProfileResponse } from '../types';
import type { MotionPreference, Preferences, TextTone } from '../preferences';
import { DEFAULT_PREFERENCES } from '../preferences';

interface ProfilePageProps {
  refreshKey: number;
  libraryId: number;
  libraryName: string;
  apiOnline: boolean | null;
  preferences: Preferences;
  onPreferencesChange: (preferences: Preferences) => void;
}

interface LocalProfile {
  name: string;
  signature: string;
  avatar: string | null;
}

type ProfileModal = 'edit' | 'ai' | 'about' | 'reset' | null;
const ART_SUPPORT = '@xxxx（B站）';

const PROFILE_KEY = 'seeenglish.profile.v1';
const DEFAULT_SIGNATURE = 'A word after a word after a word is power.';

const DEFAULT_PROFILE: LocalProfile = {
  name: 'SeeEnglish',
  signature: DEFAULT_SIGNATURE,
  avatar: null,
};

function loadLocalProfile(): LocalProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    const avatar =
      typeof parsed.avatar === 'string' && parsed.avatar.startsWith('data:image/')
        ? parsed.avatar
        : null;
    return {
      name:
        typeof parsed.name === 'string' && parsed.name.trim()
          ? parsed.name.trim().slice(0, 40)
          : DEFAULT_PROFILE.name,
      signature:
        typeof parsed.signature === 'string'
          ? parsed.signature.slice(0, 200)
          : DEFAULT_PROFILE.signature,
      avatar,
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveLocalProfile(profile: LocalProfile): void {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Local preferences should never make the app unusable.
  }
}

function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件。'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('图片不能超过 8MB。'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法处理这张图片。');
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('这张图片无法读取。'));
    };
    image.src = objectUrl;
  });
}

const TONE_OPTIONS: Array<{ id: TextTone; label: string; className: string }> = [
  { id: 'ink', label: '墨蓝', className: 'tone-swatch--ink' },
  { id: 'slate', label: '石板', className: 'tone-swatch--slate' },
  { id: 'warm', label: '暖褐', className: 'tone-swatch--warm' },
  { id: 'rose', label: '雾粉', className: 'tone-swatch--rose' },
  { id: 'sky', label: '雾蓝', className: 'tone-swatch--sky' },
  { id: 'moss', label: '苔绿', className: 'tone-swatch--moss' },
];

const MOTION_OPTIONS: Array<{ id: MotionPreference; label: string }> = [
  { id: 'standard', label: '标准' },
  { id: 'reduced', label: '精简' },
];

export function ProfilePage({
  refreshKey,
  libraryId,
  libraryName,
  apiOnline,
  preferences,
  onPreferencesChange,
}: ProfilePageProps) {
  const [profile, setProfile] = useState<LocalProfile>(loadLocalProfile);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [modal, setModal] = useState<ProfileModal>(null);
  const [draftName, setDraftName] = useState(profile.name);
  const [draftSignature, setDraftSignature] = useState(profile.signature);
  const [draftAvatar, setDraftAvatar] = useState<string | null>(profile.avatar);
  const [editError, setEditError] = useState('');
  const [showAllTones, setShowAllTones] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDataError('');
    api
      .profile(libraryId)
      .then((next) => {
        if (!active) return;
        setData(next);
      })
      .catch(() => {
        if (!active) return;
        setDataError('学习数据暂时没有连接上本地 API。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey, attempt, libraryId]);

  const overview = data?.overview;
  const stats = data?.stats;
  const score = overview?.score ?? 0;
  const totalWords = overview?.total_words ?? stats?.words ?? 0;
  const archivedWords = overview?.archived_words ?? stats?.archived_words ?? 0;
  const archivePercent = totalWords > 0 ? (archivedWords / totalWords) * 100 : 0;

  const openEdit = () => {
    setDraftName(profile.name);
    setDraftSignature(profile.signature);
    setDraftAvatar(profile.avatar);
    setEditError('');
    setModal('edit');
  };

  const saveProfile = () => {
    const name = draftName.trim();
    if (!name) {
      setEditError('名字不能为空。');
      return;
    }
    const next: LocalProfile = {
      name: name.slice(0, 40),
      signature: draftSignature.trim().slice(0, 200),
      avatar: draftAvatar,
    };
    setProfile(next);
    saveLocalProfile(next);
    setModal(null);
  };

  const handleAvatarFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setEditError('');
    try {
      const dataUrl = await resizeAvatar(file);
      setDraftAvatar(dataUrl);
    } catch (avatarError) {
      setEditError(
        avatarError instanceof Error ? avatarError.message : '头像处理失败。',
      );
    }
  };

  const setTone = (tone: TextTone) => {
    onPreferencesChange({ ...preferences, tone });
  };

  const setMotion = (motion: MotionPreference) => {
    onPreferencesChange({ ...preferences, motion });
  };

  const primaryTones = TONE_OPTIONS.slice(0, 3);
  const extraTones = TONE_OPTIONS.slice(3);
  const activeExtraTone = extraTones.find((tone) => tone.id === preferences.tone);
  const visibleTones = showAllTones ? TONE_OPTIONS : primaryTones;

  return (
    <section className="page page--profile">
      <header className="profile-page-head">
        <div className="eyebrow">
          <span className="eyebrow__line" />
          PROFILE · 04
        </div>
        <span className="profile-page-stamp">
          <span className="status-pill__dot" />
          LOCAL ACCOUNT
        </span>
      </header>

      <article className="profile-hero glass">
        <div className="profile-avatar-wrap">
          <div className="profile-avatar">
            {profile.avatar ? (
              <img src={profile.avatar} alt={`${profile.name} 的头像`} />
            ) : (
              <Fingerprint size={38} strokeWidth={1.35} aria-hidden="true" />
            )}
          </div>
          <button
            type="button"
            className="profile-avatar__edit"
            onClick={openEdit}
            aria-label="更换头像"
          >
            <Camera size={14} strokeWidth={1.9} />
          </button>
        </div>

        <div className="profile-identity">
          <span className="profile-account-line">LOCAL ACCOUNT · 本地账户</span>
          <h1>{profile.name}</h1>
          <p className="profile-signature">
            {profile.signature || DEFAULT_SIGNATURE}
          </p>
          <div className="profile-meta-row">
            <span>
              <HardDrive size={13} strokeWidth={1.7} />
              数据仅保存在本机
            </span>
            <span>
              <ShieldCheck size={13} strokeWidth={1.7} />
              无需登录
            </span>
            <span className={apiOnline === false ? 'is-offline' : ''}>
              <span className="profile-meta-dot" />
              {apiOnline === false ? 'API 未连接' : '本地 API'}
            </span>
          </div>
        </div>

        <button type="button" className="button button--outline profile-edit-button" onClick={openEdit}>
          <Pencil size={15} strokeWidth={1.8} />
          编辑资料
        </button>
      </article>

      {dataError && (
        <div className="profile-data-error" role="alert">
          <span>{dataError}</span>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            重试
          </button>
        </div>
      )}

      <div className="profile-dashboard">
        <article className="profile-progress glass">
          <div className="profile-card-head">
            <span className="eyebrow">LEARNING PROGRESS</span>
            <span className="profile-level">{loading ? '读取中' : overview?.level ?? '—'}</span>
          </div>

          <div className="profile-score-line">
            <span className="profile-score-value">{score.toFixed(3)}</span>
            <span className="profile-score-unit">总掌握分</span>
          </div>
          <div className="profile-library-label">
            <LibraryBig size={12} strokeWidth={1.8} />
            当前词库 · {libraryName}
          </div>
          <p className="profile-score-note">100 分约为 CET-4 水平 · 不设上限</p>

          <div className="profile-archive">
            <div>
              <span>已归档</span>
              <b>
                {archivedWords} <i>/ {totalWords}</i>
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
              <b>{overview?.total_reviews ?? stats?.total_reviews ?? 0}</b>
              <small>次见面</small>
            </div>
            <div>
              <span>SETTLED</span>
              <b>{overview?.settlement_count ?? 0}</b>
              <small>次结算</small>
            </div>
            <div>
              <span>ARCHIVED</span>
              <b>{archivedWords}</b>
              <small>已归档</small>
            </div>
          </div>
        </article>

        <article className="profile-trend glass">
          <div className="profile-card-head">
            <span className="eyebrow">SCORE TREND · 30 DAYS</span>
            <span className="profile-trend__current">{score.toFixed(3)}</span>
          </div>
          <p className="profile-trend__copy">最近 30 天的总分变化，只记录结算和归档。</p>
          {data?.daily?.length ? (
            <DailyScoreChart points={data.daily} />
          ) : (
            <div className="profile-chart-empty">
              {loading ? '正在读取趋势…' : '还没有可以展示的结算记录。'}
            </div>
          )}
        </article>

        <article className="profile-settings glass">
          <div className="profile-card-head">
            <span className="eyebrow">SETTINGS · 设置</span>
            <span className="profile-settings__hint">所有偏好留在本机</span>
          </div>

          <div className="profile-settings__grid">
            <div className="profile-settings__list">
              <button type="button" onClick={openEdit}>
                <span className="profile-setting-icon">
                  <UserRound size={17} strokeWidth={1.7} />
                </span>
                <span>
                  <b>个人信息</b>
                  <small>头像、名字和签名</small>
                </span>
                <ChevronRight size={16} strokeWidth={1.7} />
              </button>

              <button type="button" onClick={() => setModal('ai')}>
                <span className="profile-setting-icon">
                  <Sparkles size={17} strokeWidth={1.7} />
                </span>
                <span>
                  <b>AI 配置</b>
                  <small>训练模式与探索模式</small>
                </span>
                <span className="profile-setting-soon">待开放</span>
                <ChevronRight size={16} strokeWidth={1.7} />
              </button>

              <button type="button" onClick={() => setModal('about')}>
                <span className="profile-setting-icon">
                  <Info size={17} strokeWidth={1.7} />
                </span>
                <span>
                  <b>关于</b>
                  <small>版本、技术与本地数据</small>
                </span>
                <ChevronRight size={16} strokeWidth={1.7} />
              </button>
            </div>

            <div className="profile-appearance">
              <div className="profile-appearance__title">
                <span className="eyebrow">APPEARANCE</span>
                <span>外观</span>
              </div>

              <div className="profile-setting-row">
                <span className="profile-setting-label">
                  <Palette size={14} strokeWidth={1.8} />
                  字色
                </span>
                <div className="profile-tone-options" role="group" aria-label="字色">
                  {visibleTones.map((tone) => (
                    <button
                      type="button"
                      key={tone.id}
                      className={`profile-tone ${tone.className} ${
                        preferences.tone === tone.id ? 'is-active' : ''
                      }`}
                      onClick={() => setTone(tone.id)}
                      aria-pressed={preferences.tone === tone.id}
                    >
                      <span className="profile-tone__dot" />
                      {tone.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`profile-tone profile-tone--more ${
                      !showAllTones && activeExtraTone ? activeExtraTone.className : ''
                    } ${!showAllTones && activeExtraTone ? 'is-active' : ''}`}
                    onClick={() => setShowAllTones((value) => !value)}
                    aria-expanded={showAllTones}
                    aria-label={showAllTones ? '收起更多字色' : '查看更多字色'}
                  >
                    {!showAllTones && activeExtraTone ? (
                      <span className="profile-tone__dot" />
                    ) : (
                      <MoreHorizontal size={13} strokeWidth={1.9} />
                    )}
                    {showAllTones ? '收起' : '更多'}
                  </button>
                </div>
              </div>

              <div className="profile-setting-row">
                <span className="profile-setting-label">
                  <Gauge size={14} strokeWidth={1.8} />
                  界面动效
                </span>
                <div className="profile-segment" role="group" aria-label="界面动效">
                  {MOTION_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      className={preferences.motion === option.id ? 'is-active' : ''}
                      onClick={() => setMotion(option.id)}
                      aria-pressed={preferences.motion === option.id}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="profile-setting-row">
                <span className="profile-setting-label">
                  <Sparkles size={14} strokeWidth={1.8} />
                  漂浮装饰
                </span>
                <button
                  type="button"
                  className={`profile-switch ${preferences.floaters ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={preferences.floaters}
                  onClick={() =>
                    onPreferencesChange({
                      ...preferences,
                      floaters: !preferences.floaters,
                    })
                  }
                >
                  <span />
                  {preferences.floaters ? '显示' : '隐藏'}
                </button>
              </div>

              <div className="profile-setting-row">
                <span className="profile-setting-label">
                  <EyeOff size={14} strokeWidth={1.8} />
                  沉浸模式
                </span>
                <button
                  type="button"
                  className={`profile-switch ${preferences.immersive ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={preferences.immersive}
                  onClick={() =>
                    onPreferencesChange({
                      ...preferences,
                      immersive: !preferences.immersive,
                    })
                  }
                >
                  <span />
                  {preferences.immersive ? '开启' : '关闭'}
                </button>
              </div>
              <p className="profile-setting-explain">
                开启后，其他页面的标题和说明文字会淡出，只留下可操作的界面。
              </p>

              <button
                type="button"
                className="profile-reset"
                onClick={() => setModal('reset')}
              >
                恢复默认外观
              </button>
            </div>
          </div>
        </article>
      </div>

      {modal === 'edit' && (
        <ProfileModal title="编辑个人信息" eyebrow="PROFILE · LOCAL" onClose={() => setModal(null)}>
          <div className="profile-edit">
            <div className="profile-edit-avatar-row">
              <div className="profile-avatar profile-avatar--editor">
                {draftAvatar ? (
                  <img src={draftAvatar} alt="头像预览" />
                ) : (
                  <Fingerprint size={32} strokeWidth={1.35} />
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="button button--outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera size={15} strokeWidth={1.8} />
                  上传新头像
                </button>
                {draftAvatar && (
                  <button
                    type="button"
                    className="profile-remove-avatar"
                    onClick={() => setDraftAvatar(null)}
                  >
                    移除头像
                  </button>
                )}
                <p>建议使用正方形图片，会自动裁成 256×256。</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void handleAvatarFile(event)}
              />
            </div>

            <label className="profile-edit-field">
              <span>名字</span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                maxLength={40}
                autoFocus
                placeholder="给自己取一个名字"
              />
            </label>
            <label className="profile-edit-field">
              <span>签名</span>
              <textarea
                value={draftSignature}
                onChange={(event) => setDraftSignature(event.target.value)}
                rows={3}
                maxLength={200}
                placeholder={DEFAULT_SIGNATURE}
              />
            </label>
            {editError && <p className="profile-edit-error">{editError}</p>}
            <div className="profile-modal__actions">
              <button type="button" className="button button--ghost" onClick={() => setModal(null)}>
                取消
              </button>
              <button type="button" className="button button--primary" onClick={saveProfile}>
                <Check size={16} strokeWidth={2} />
                保存
              </button>
            </div>
          </div>
        </ProfileModal>
      )}

      {modal === 'ai' && (
        <ProfileModal title="AI 配置" eyebrow="AI REVIEW · 待开放" onClose={() => setModal(null)}>
          <div className="profile-placeholder-panel">
            <span className="profile-placeholder-icon">
              <Sparkles size={26} strokeWidth={1.4} />
            </span>
            <h3>AI 复习还在准备中。</h3>
            <p>
              训练模式和探索模式接入后，这里会用来选择模型、配置密钥和控制 AI 的复习方式。
              现在先把入口留在这里。
            </p>
            <div className="profile-ai-rows">
              <div>
                <span>模型</span>
                <b>未接入</b>
              </div>
              <div>
                <span>API Key</span>
                <b>待开放</b>
              </div>
              <div>
                <span>训练模式</span>
                <span className="profile-disabled-switch" />
              </div>
              <div>
                <span>探索模式</span>
                <span className="profile-disabled-switch" />
              </div>
            </div>
          </div>
        </ProfileModal>
      )}

      {modal === 'about' && (
        <ProfileModal title="关于 SeeEnglish" eyebrow="ABOUT · 见词" onClose={() => setModal(null)}>
          <div className="profile-about">
            <div className="profile-about__brand">
              <span className="profile-about__mark">
                <Sparkles size={18} strokeWidth={1.5} />
              </span>
              <div>
                <h3>SeeEnglish</h3>
                <p>见词 · 本地优先的英语语言索引</p>
              </div>
            </div>
            <div className="profile-about__rows">
              <div>
                <span>版本</span>
                <b>0.6.0</b>
              </div>
              <div>
                <span>数据</span>
                <b>data/seeenglish.db</b>
              </div>
              <div>
                <span>技术栈</span>
                <b>React · TypeScript · FastAPI · SQLite</b>
              </div>
              <div>
                <span>状态</span>
                <b className={apiOnline === false ? 'is-offline' : ''}>
                  {apiOnline === false ? '本地 API 未连接' : '仅在本机运行'}
                </b>
              </div>
              <div>
                <span>美术支持</span>
                <b className="profile-about__art">{ART_SUPPORT}</b>
              </div>
            </div>
            <p className="profile-about__note">
              图标和名字已经单独保存在 <code>assets/brand/</code>，后续可以用于桌面图标和安装包。
            </p>
          </div>
        </ProfileModal>
      )}

      {modal === 'reset' && (
        <ProfileModal
          title="恢复默认外观？"
          eyebrow="APPEARANCE · RESET"
          onClose={() => setModal(null)}
        >
          <div className="profile-reset-confirm">
            <span className="profile-reset-confirm__icon">
              <RotateCcw size={22} strokeWidth={1.6} />
            </span>
            <p>
              字色、界面动效、漂浮装饰和沉浸模式都会恢复到默认设置。
              你的词库、头像、名字和签名不会受到影响。
            </p>
            <div className="profile-modal__actions">
              <button type="button" className="button button--ghost" onClick={() => setModal(null)}>
                取消
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  onPreferencesChange({ ...DEFAULT_PREFERENCES });
                  setShowAllTones(false);
                  setModal(null);
                }}
              >
                <RotateCcw size={16} strokeWidth={1.8} />
                恢复默认
              </button>
            </div>
          </div>
        </ProfileModal>
      )}
    </section>
  );
}

function DailyScoreChart({ points }: { points: DailyScorePoint[] }) {
  const chartWidth = 330;
  const chartHeight = 112;
  const left = 8;
  const right = 8;
  const top = 12;
  const bottom = 86;
  const values = points.map((point) => point.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.01);
  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? chartWidth / 2
        : left + (index / (points.length - 1)) * (chartWidth - left - right);
    const y = bottom - ((point.score - min) / range) * (bottom - top);
    return { x, y };
  });
  const polyline = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = `${first.x.toFixed(1)},${bottom} ${polyline} ${last.x.toFixed(1)},${bottom}`;
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const delta = lastPoint.score - firstPoint.score;
  const middle = points[Math.floor(points.length / 2)];

  return (
    <div className="profile-chart">
      <div className="profile-chart__summary">
        <span>
          <b>{(delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(3)}</b>
          <small>30 天变化</small>
        </span>
        <span>{lastPoint.label}</span>
      </div>
      <svg
        className="profile-chart__svg"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="最近 30 天总分趋势"
      >
        <line
          x1="0"
          y1={bottom + 2}
          x2={chartWidth}
          y2={bottom + 2}
          className="profile-chart__baseline"
        />
        <polygon points={area} className="profile-chart__area" />
        <polyline points={polyline} className="profile-chart__line" />
        <circle cx={last.x} cy={last.y} r="3.4" className="profile-chart__dot" />
      </svg>
      <div className="profile-chart__axis">
        <span>{firstPoint.label}</span>
        <span>{middle.label}</span>
        <span>{lastPoint.label}</span>
      </div>
    </div>
  );
}

function ProfileModal({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="profile-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="profile-modal__panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="profile-modal__head">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" className="profile-modal__close" onClick={onClose} aria-label="关闭">
            <X size={17} strokeWidth={1.8} />
          </button>
        </header>
        <div className="profile-modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
