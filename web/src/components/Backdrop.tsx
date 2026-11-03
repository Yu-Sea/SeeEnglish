import type { CSSProperties } from 'react';

interface Floater {
  id: string;
  kind: 'word' | 'glyph' | 'ring' | 'index' | 'quote' | 'plus' | 'dot';
  left: string;
  top: string;
  delay: string;
  duration: string;
  rotate: string;
  word?: string;
  detail?: string;
}

const FLOATERS: Floater[] = [
  {
    id: 'serendipity',
    kind: 'word',
    left: '4.5%',
    top: '19%',
    delay: '-2s',
    duration: '17s',
    rotate: '-6deg',
    word: 'serendipity',
    detail: '/ˌserənˈdɪpəti/',
  },
  {
    id: 'glyph',
    kind: 'glyph',
    left: '89%',
    top: '24%',
    delay: '-7s',
    duration: '19s',
    rotate: '7deg',
    word: 'Aa',
  },
  {
    id: 'ring',
    kind: 'ring',
    left: '10%',
    top: '64%',
    delay: '-4s',
    duration: '21s',
    rotate: '0deg',
  },
  {
    id: 'ephemeral',
    kind: 'word',
    left: '84%',
    top: '59%',
    delay: '-9s',
    duration: '18s',
    rotate: '5deg',
    word: 'ephemeral',
    detail: '短暂的',
  },
  {
    id: 'index',
    kind: 'index',
    left: '17%',
    top: '38%',
    delay: '-5s',
    duration: '23s',
    rotate: '-3deg',
    word: '01',
    detail: 'WORD',
  },
  {
    id: 'quote',
    kind: 'quote',
    left: '78%',
    top: '39%',
    delay: '-11s',
    duration: '20s',
    rotate: '4deg',
    word: '“word”',
  },
  {
    id: 'plus',
    kind: 'plus',
    left: '6%',
    top: '84%',
    delay: '-3s',
    duration: '16s',
    rotate: '0deg',
    word: '+',
  },
  {
    id: 'dot',
    kind: 'dot',
    left: '92%',
    top: '79%',
    delay: '-8s',
    duration: '14s',
    rotate: '0deg',
  },
];

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop__base" />
      <div className="backdrop__wash backdrop__wash--one" />
      <div className="backdrop__wash backdrop__wash--two" />
      <div className="backdrop__wash backdrop__wash--three" />
      <div className="backdrop__dots" />
      <div className="backdrop__orb" />
      <div className="floaters">
        {FLOATERS.map((floater) => (
          <div
            key={floater.id}
            className={`floater floater--${floater.kind}`}
            style={
              {
                left: floater.left,
                top: floater.top,
                '--delay': floater.delay,
                '--duration': floater.duration,
                '--rotate': floater.rotate,
              } as CSSProperties
            }
          >
            {floater.kind === 'ring' && <span className="floater__ring" />}
            {floater.kind === 'dot' && <span className="floater__dot" />}
            {floater.kind === 'plus' && <span className="floater__plus">+</span>}
            {(floater.kind === 'word' || floater.kind === 'glyph' || floater.kind === 'quote') && (
              <span className="floater__word">{floater.word}</span>
            )}
            {floater.kind === 'word' && <span className="floater__detail">{floater.detail}</span>}
            {floater.kind === 'index' && (
              <>
                <span className="floater__index">{floater.word}</span>
                <span className="floater__detail">{floater.detail}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
