import { useCallback, useEffect, useRef, useState } from 'react';
import { Article } from './components/Article.jsx';
import { Header } from './components/Header.jsx';
import { Home } from './components/Home.jsx';
import { Metrics } from './components/Metrics.jsx';
import { SettingsDialog } from './components/SettingsDialog.jsx';
import { useHistory } from './hooks/useHistory.js';
import { dropLegacyStorage, getApiKey, getDark, saveDark } from './lib/settings.js';
import { leaf, trail } from './lib/topics.js';
import { ABOUT_TOPIC, generateArticle, generateJourney } from './services/ai.js';

const JOURNEY_TITLE = 'Journey Retrospective';

// A home page reached after two or more stops carries a retrospective of them.
const hasRetrospective = (entry) => Boolean(entry?.home) && entry.stops?.length > 1;
const needsWriting = (entry) => Boolean(entry) && !entry.html && (entry.home ? hasRetrospective(entry) : true);

function Skeleton() {
  return (
    <div className="skeleton" aria-hidden="true">
      {[60, 100, 96, 88, 100, 72].map((width, i) => (
        <div key={i} style={{ width: `${width}%`, height: i === 0 ? '2.25rem' : undefined }} />
      ))}
    </div>
  );
}

function App() {
  const { entries, current, journey, push, fill, back, forward, canGoBack, canGoForward } = useHistory();
  const [draft, setDraft] = useState(null); // the page being written: { id, html, status }
  const [error, setError] = useState(null); // why a page could not be written: { id, message, needsKey }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dark, setDark] = useState(getDark);
  const [spent, setSpent] = useState(() => entries.reduce((sum, entry) => sum + (entry.metrics?.cost ?? 0), 0));
  const addSpend = useCallback((usd) => setSpent((sum) => sum + usd), []);

  const { id, topic, stops } = current ?? {};
  const failed = error?.id === id ? error : null;
  const writing = needsWriting(current) && !failed;
  const live = writing && draft?.id === id ? draft : null;
  const isJourney = hasRetrospective(current) && (writing || Boolean(current.html));
  const showsPage = Boolean(current) && (!current.home || isJourney);
  const html = live?.html || current?.html || '';
  const shownTopic = isJourney ? JOURNEY_TITLE : (topic ?? '');
  const crumbs = topic ? trail(topic) : [];

  // Keep the search box on the page being shown, without an effect.
  const [query, setQuery] = useState('');
  const [queryTopic, setQueryTopic] = useState(null);
  if (queryTopic !== shownTopic) {
    setQueryTopic(shownTopic);
    setQuery(isJourney ? '' : leaf(shownTopic));
  }

  useEffect(() => dropLegacyStorage(), []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    document.title = shownTopic ? `${leaf(shownTopic)} · LatentSpace` : 'LatentSpace';
  }, [shownTopic]);

  // Whatever page the reader is on, the model writes it if it has not been
  // written yet: a new link, a shared ?topic= address, or a page revisited
  // after its text was dropped. Leaving the page cancels the writing.
  useEffect(() => {
    if (!writing) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    const options = { signal, onUpdate: (update) => signal.aborted || setDraft({ id, ...update }) };
    const task = topic ? generateArticle(topic, options) : generateJourney(stops, options);
    task.then(
      (page) => {
        if (signal.aborted) return;
        addSpend(page.metrics.cost);
        fill(id, page);
        setDraft(null);
      },
      (failure) => {
        if (signal.aborted) return;
        setDraft(null);
        setError({
          id,
          message: failure.message || 'Something went wrong.',
          needsKey: [0, 401, 403].includes(failure.status),
        });
      },
    );
    return () => controller.abort();
  }, [writing, id, topic, stops, fill, addSpend]);

  // A new page starts at the top; going back or forward returns to where the reader was.
  const scrolls = useRef(new Map());
  const shownId = useRef(null);
  const rememberScroll = useCallback(() => scrolls.current.set(shownId.current, window.scrollY), []);
  useEffect(() => {
    shownId.current = id ?? null;
    window.scrollTo({ top: scrolls.current.get(id ?? null) ?? 0, behavior: 'instant' });
  }, [id]);
  useEffect(() => {
    // Runs while the page being left is still on screen.
    window.addEventListener('popstate', rememberScroll);
    return () => window.removeEventListener('popstate', rememberScroll);
  }, [rememberScroll]);

  const navigate = useCallback(
    (next) => {
      rememberScroll();
      push({ topic: next });
    },
    [push, rememberScroll],
  );

  // Home ends the journey. With two or more stops behind it, the model writes a retrospective.
  const goHome = () => {
    if (!current || (current.home && !isJourney)) return;
    rememberScroll();
    push({ home: true, stops: journey.filter((entry) => entry.html).map((entry) => entry.topic) });
  };

  return (
    <>
      <Header
        query={query}
        onQuery={setQuery}
        onSearch={navigate}
        onHome={goHome}
        onBack={back}
        onForward={forward}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        dark={dark}
        onToggleDark={() => {
          saveDark(!dark);
          setDark(!dark);
        }}
        onSettings={() => setSettingsOpen(true)}
        busy={writing}
      />

      <main className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
        {failed && (
          <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border-2 border-accent bg-card px-4 py-3">
            <p className="min-w-0 flex-1">{failed.message}</p>
            {failed.needsKey && (
              <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>Open settings</button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setError(null)}>Try again</button>
          </div>
        )}

        <div className="rounded-xl border border-line bg-card px-5 py-6 shadow-sm sm:px-10 sm:py-9">
          {!showsPage ? (
            <Home
              hasKey={Boolean(getApiKey())}
              onNavigate={navigate}
              onSettings={() => setSettingsOpen(true)}
              onSpend={addSpend}
            />
          ) : (
            <article aria-busy={writing}>
              {crumbs.length > 0 && (
                <nav aria-label="Path here" className="mb-3 text-sm text-muted">
                  <ol className="flex flex-wrap gap-x-1.5">
                    {crumbs.map((crumb, i) => (
                      <li key={i}>
                        {crumb} <span aria-hidden="true">›</span>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
              {writing && (
                <p className="mb-3 text-sm font-semibold text-accent" role="status">
                  {live?.status ?? 'Writing'}…
                </p>
              )}
              {html ? (
                <Article html={html} topic={isJourney ? '' : topic} onNavigate={navigate} journey={isJourney} />
              ) : writing ? (
                <Skeleton />
              ) : (
                <>
                  <h1 className="font-serif text-4xl font-bold">{leaf(shownTopic)}</h1>
                  <p className="mt-3 text-muted">This page has not been written yet.</p>
                </>
              )}
              {!writing && current.truncated && (
                <p className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm text-muted">
                  This page ran into its length limit, even after the model continued it.
                  <button type="button" className="btn" onClick={() => navigate(topic)}>Write it again</button>
                </p>
              )}
              {!writing && current.reasoning && (
                <details className="mt-6 border-t border-line pt-4 text-sm text-muted">
                  <summary className="cursor-pointer font-semibold">Model reasoning</summary>
                  <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed">{current.reasoning}</p>
                </details>
              )}
            </article>
          )}
        </div>
      </main>

      <footer className="mx-auto max-w-5xl space-y-3 px-4 pb-10 text-center">
        <Metrics metrics={showsPage && !writing ? current.metrics : null} spent={spent} />
        <button type="button" className="text-sm text-link underline" onClick={() => navigate(ABOUT_TOPIC)}>
          About LatentSpace
        </button>
      </footer>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

export default App;
