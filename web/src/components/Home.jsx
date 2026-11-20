import { useEffect, useState } from 'react';
import { generateStarters, spareStarters } from '../services/ai.js';

// One request per page load. Coming back to the home page reuses its answer.
let request = null;
let answer = null;

/** Six starting points written by the model for this page load, or null while they are on their way. */
function useStarters(enabled, onSpend) {
  const [topics, setTopics] = useState(answer);

  useEffect(() => {
    if (!enabled || answer) return undefined;
    let shown = true;
    request ??= generateStarters()
      .then((result) => {
        onSpend(result.cost);
        return result.topics;
      })
      .catch(() => spareStarters());
    request.then((list) => {
      answer = list;
      if (shown) setTopics(list);
    });
    return () => {
      shown = false;
    };
  }, [enabled, onSpend]);

  return topics;
}

const PLACEHOLDER_WIDTHS = ['6rem', '8rem', '7rem', '9rem', '6.5rem', '7.5rem'];

export function Home({ hasKey, onNavigate, onSettings, onSpend }) {
  const starters = useStarters(hasKey, onSpend);

  return (
    <section className="mx-auto max-w-xl py-10 text-center sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">The free encyclopedia of latents</p>
      <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight sm:text-5xl">Welcome to LatentSpace</h1>
      <p className="mt-4 text-lg text-muted">
        Every page is written the moment you ask for it, and every link opens a page that did not exist until you clicked.
      </p>

      {hasKey ? (
        <>
          <p className="mt-10 text-sm text-muted">Search above, or start somewhere:</p>
          <ul className="mt-3 flex min-h-[5.5rem] flex-wrap content-start justify-center gap-2" aria-busy={!starters}>
            {starters
              ? starters.map((topic) => (
                  <li key={topic}>
                    <button type="button" className="btn" onClick={() => onNavigate(topic)}>{topic}</button>
                  </li>
                ))
              : PLACEHOLDER_WIDTHS.map((width) => (
                  <li
                    key={width}
                    aria-hidden="true"
                    className="h-10 animate-pulse rounded-lg bg-line motion-reduce:animate-none"
                    style={{ width }}
                  />
                ))}
          </ul>
        </>
      ) : (
        <div className="mt-10 rounded-xl border border-edge bg-paper p-5">
          <p className="text-ink">Add your Cerebras API key to start exploring. It stays in this browser.</p>
          <button type="button" className="btn btn-primary mt-3" onClick={onSettings}>Add API key</button>
        </div>
      )}
    </section>
  );
}
