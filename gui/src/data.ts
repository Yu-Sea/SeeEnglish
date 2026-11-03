export type PageId = 'capture' | 'review' | 'library' | 'profile';

export interface GuiWord {
  id: number;
  word: string;
  note: string;
  forms: string[];
  sentences: string[];
  archived: boolean;
  updated: string;
}

export interface GuiLibrary {
  id: number;
  name: string;
  group: string;
  words: number;
  sentences: number;
  score: number;
  isDefault?: boolean;
}

export const sampleWords: GuiWord[] = [
  {
    id: 1,
    word: 'apple',
    note: '苹果。也可以指珍视的人。',
    forms: ['apples'],
    sentences: ['She kept an apple in her bag for the walk home.'],
    archived: true,
    updated: '10.31',
  },
  {
    id: 2,
    word: 'attentive',
    note: '专注的、留意的。比 careful 更强调把注意力交出去。',
    forms: ['attention', 'attentively'],
    sentences: ['He was attentive to every small change in her voice.'],
    archived: false,
    updated: '10.30',
  },
  {
    id: 3,
    word: 'book',
    note: '书；预订。名词和动词之间只隔着一个“提前”。',
    forms: ['books', 'booked'],
    sentences: ['I booked a table by the window.'],
    archived: false,
    updated: '10.31',
  },
  {
    id: 4,
    word: 'borrow',
    note: '借入。和 lend 的方向相反。',
    forms: ['borrowed', 'borrowing'],
    sentences: ['May I borrow your pen for a moment?'],
    archived: false,
    updated: '10.29',
  },
  {
    id: 5,
    word: 'ephemeral',
    note: '短暂的、转瞬即逝的。像傍晚最后一点光。',
    forms: ['ephemerally'],
    sentences: ['The beauty of the city was ephemeral, gone with the rain.'],
    archived: false,
    updated: '10.31',
  },
  {
    id: 6,
    word: 'English',
    note: '英语；英格兰的。',
    forms: [],
    sentences: [],
    archived: true,
    updated: '10.28',
  },
  {
    id: 7,
    word: 'look',
    note: '看；看起来。目光停下来的那一下。',
    forms: ['looked', 'looking'],
    sentences: ['She looked at the letter without opening it.'],
    archived: true,
    updated: '10.31',
  },
  {
    id: 8,
    word: 'lucid',
    note: '清晰的、明白的。像水面没有风。',
    forms: ['lucidity', 'lucidly'],
    sentences: ['He gave a lucid explanation of the idea.'],
    archived: false,
    updated: '10.30',
  },
  {
    id: 9,
    word: 'orange',
    note: '橙子；橙色。',
    forms: ['oranges'],
    sentences: [],
    archived: false,
    updated: '10.31',
  },
  {
    id: 10,
    word: 'quiet',
    note: '安静的。不是没有声音，而是声音不急着证明自己。',
    forms: ['quieter', 'quietly'],
    sentences: ['The room went quiet after the question.'],
    archived: false,
    updated: '10.27',
  },
  {
    id: 11,
    word: 'serendipity',
    note: '意外发现美好事物的运气。',
    forms: ['serendipitous'],
    sentences: ['Finding that little bookshop was pure serendipity.'],
    archived: false,
    updated: '10.31',
  },
  {
    id: 12,
    word: 'threshold',
    note: '门槛；临界点。跨过去之前的那一秒。',
    forms: ['thresholds'],
    sentences: ['She paused at the threshold, listening.'],
    archived: false,
    updated: '10.26',
  },
];

export const sampleLibraries: GuiLibrary[] = [
  {
    id: 1,
    name: '默认词库',
    group: '未分组',
    words: 12,
    sentences: 8,
    score: 0.25,
    isDefault: true,
  },
  {
    id: 2,
    name: '阅读摘录',
    group: '阅读',
    words: 64,
    sentences: 21,
    score: 2.16,
  },
  {
    id: 3,
    name: '考研词汇',
    group: '考试',
    words: 312,
    sentences: 87,
    score: 9.42,
  },
  {
    id: 4,
    name: '电影台词',
    group: '日常',
    words: 38,
    sentences: 12,
    score: 1.08,
  },
];

export const searchSuggestions = [
  {
    word: 'serendipity',
    type: 'exact' as const,
    label: '完全匹配',
    note: '意外发现美好事物的运气。',
    existing: true,
  },
  {
    word: 'serendipitous',
    type: 'derived' as const,
    label: '形容词形式',
    note: '偶然发生的、意外幸运的。',
    existing: false,
  },
  {
    word: 'serene',
    type: 'prefix' as const,
    label: '前缀相近',
    note: '平静的、安详的。',
    existing: false,
  },
];

export const reviewTrend = [
  0.02, 0.03, 0.03, 0.05, 0.05, 0.08, 0.08, 0.09, 0.12, 0.12, 0.15, 0.17,
  0.17, 0.2, 0.22, 0.22, 0.24, 0.24, 0.25,
];

export const dailyTrend = Array.from({ length: 30 }, (_, index) => {
  const wave = Math.sin(index / 3.2) * 0.18 + Math.cos(index / 5) * 0.08;
  return Number((0.25 + index * 0.006 + wave).toFixed(3));
});

export const toneOptions = [
  { id: 'ink', label: '墨蓝', color: '#07182c' },
  { id: 'slate', label: '石墨', color: '#45566b' },
  { id: 'warm', label: '暖棕', color: '#6b4e3d' },
  { id: 'rose', label: '豆沙', color: '#8a5360' },
  { id: 'sky', label: '天青', color: '#2f6fed' },
  { id: 'moss', label: '苔绿', color: '#4d6b56' },
] as const;

export type ToneId = (typeof toneOptions)[number]['id'];

export function letterOf(word: string): string {
  const first = word.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

export function groupWords(words: GuiWord[]): { letter: string; words: GuiWord[] }[] {
  const buckets = new Map<string, GuiWord[]>();
  for (const word of words) {
    const letter = letterOf(word.word);
    const bucket = buckets.get(letter);
    if (bucket) bucket.push(word);
    else buckets.set(letter, [word]);
  }
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat('#');
  return letters
    .filter((letter) => buckets.has(letter))
    .map((letter) => ({
      letter,
      words: [...(buckets.get(letter) ?? [])].sort((a, b) =>
        a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }),
      ),
    }));
}
