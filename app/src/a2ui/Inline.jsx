import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@astryxdesign/core/Link';
import { isExternal, parseInline, splitWords } from './inlineParse.js';
import { useNavigation, useReveal } from './navigation.js';

const plain = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
const SPAWN_MS = 800; // keep in step with the `spawn` animation in motion.css
const STAGGER_MS = 28; // between the words that arrive in one burst
const BURST_MS = 320; // however many words arrive at once, their stagger spans at most this long
const JOINER = '⁠'; // WORD JOINER: no line break on either side
// Punctuation that belongs to the word before it, in Latin, CJK, Devanagari and Arabic scripts.
const CLOSING = /^[,.;:!?%)\]}»”’…。，、；：！？）」』】》〉।॥،؛؟]+$/;

const isSpace = (part) => /^\s+$/.test(part);

/**
 * One word. Whether it animates is decided once, when it mounts, from when it was born: a word that
 * arrives while the page streams spawns; a word that is remounted later (because a link now wraps it)
 * picks the animation up where it is, with a negative delay, instead of starting over; and a word of
 * a finished page, which has no birth time, just appears.
 */
function Word({ text, born }) {
  const [style] = useState(() => {
    if (born === undefined) return undefined;
    const elapsed = performance.now() - born;
    return elapsed >= SPAWN_MS ? undefined : { animationDelay: `${-elapsed}ms` };
  });
  return (
    <span className={style ? 'w w-new' : 'w'} style={style}>
      {text}
    </span>
  );
}

/**
 * A line of a page's text, drawn word by word. Every word is its own element, keyed by where it is,
 * so as a page streams in, the words already on screen are left alone and only the new ones mount.
 * When the second pass wraps some words in a link, the link fades in and the words under it stay put.
 */
export function Inline({ text, tail = false }) {
  const { navigate, hrefFor } = useNavigation();
  const { streaming } = useReveal();
  const known = useRef(0); // how many words this line has already shown
  const births = useRef(new Map()); // word number -> when its spawn begins (ms, performance.now clock)
  const tokens = useMemo(() => parseInline(text), [text]);

  const total = tokens.reduce((n, t) => n + splitWords(t.text).filter((p) => !isSpace(p)).length, 0);
  const arriving = streaming ? Math.max(0, total - known.current) : 0;
  const step = Math.min(STAGGER_MS, BURST_MS / Math.max(arriving, 1));

  let wordNo = 0;
  let linkNo = 0;
  let order = 0;
  const words = (token, key) =>
    splitWords(token.text).map((part, i) => {
      if (isSpace(part)) return part;
      const n = wordNo++;
      if (streaming && n >= known.current && !births.current.has(n)) {
        births.current.set(n, performance.now() + order++ * step);
      }
      const word = <Word key={`${key}.${i}`} text={part} born={births.current.get(n)} />;
      // Words are inline-blocks, which a line may break between: a comma after a link could land alone
      // at the start of the next line. A word joiner forbids the break.
      return CLOSING.test(part) && (n > 0 || i > 0) ? [JOINER, word] : word;
    });

  const nodes = tokens.map((token, t) => {
    if (token.kind === 'link' && isExternal(token.target)) {
      // A link out of the app (the HTML path allows a real web address): opens in a new tab, safely.
      const no = linkNo++;
      return (
        <span key={`l${t}`} className="lw" style={{ '--i': no }}>
          <Link hasUnderline={false} isExternalLink className="latent-link" href={token.target}>
            {words(token, `l${t}`)}
          </Link>
        </span>
      );
    }
    if (token.kind === 'code') return <code key={`t${t}`} className="latent-code-inline">{token.text}</code>;
    // The accessibility pass: an abbreviation says what it stands for, a phrase in another language
    // names its language so a screen reader switches voice.
    if (token.kind === 'abbr') return <abbr key={`t${t}`} className="latent-abbr" title={token.expansion}>{words(token, `t${t}`)}</abbr>;
    if (token.kind === 'lang') return <span key={`t${t}`} lang={token.code}>{words(token, `t${t}`)}</span>;
    if (token.kind === 'link') {
      const no = linkNo++;
      return (
        <span key={`l${t}`} className="lw" style={{ '--i': no }}>
          <Link
            hasUnderline={false}
            className="latent-link"
            // a link that says where it goes: its name for a screen reader begins with what is on screen
            {...(token.desc ? { label: `${token.text}: ${token.desc}`, tooltip: token.desc } : {})}
            href={hrefFor(token.target)}
            onClick={(e) => {
              if (!plain(e)) return;
              e.preventDefault();
              navigate(token.target);
            }}
          >
            {words(token, `l${t}`)}
          </Link>
        </span>
      );
    }
    const inner = words(token, `t${t}`);
    if (token.kind === 'bold') return <strong key={`t${t}`}>{inner}</strong>;
    if (token.kind === 'italic') return <em key={`t${t}`}>{inner}</em>;
    return <span key={`t${t}`}>{inner}</span>;
  });

  // After this render these words are known: the next render only gives birth to words beyond them.
  useEffect(() => {
    known.current = total;
  });

  return (
    <>
      {nodes}
      {tail && streaming && <span className="caret" aria-hidden="true" />}
    </>
  );
}
