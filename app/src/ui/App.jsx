import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@astryxdesign/core/Button';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { NavigationProvider } from '../a2ui/catalog.jsx';
import { surfaceFrom } from '../a2ui/surface.js';
import { expandCompact } from '../engine/compact.js';
import { writeByFormat, writeJourney } from '../engine/pipeline.js';
import { ABOUT_TOPIC } from '../engine/prompts.js';
import { ensure, forget, has, unusedPrefetchCost } from '../state/cache.js';
import { stopsTo, treeRows } from '../state/journey.js';
import { engineSettings, getApiKey, saveSettings, useSettings } from '../state/settings.js';
import { overBudget, useSpend } from '../state/spend.js';
import { lensOf, pageKey, urlFor } from '../state/topics.js';
import { useJourney } from '../state/useJourney.js';
import { htmlToSurface } from './htmlSurface.js';
import { Launchpad } from './Launchpad.jsx';
import { Reader } from './Reader.jsx';
import { SettingsDialog } from './SettingsDialog.jsx';
import { Shell } from './Shell.jsx';
import { Trail } from './Trail.jsx';

const RETRO_TITLE = 'Journey Retrospective';
const PREFETCH_DELAY = 300; // a hover has to mean it
const TRAIL_KEY = 'latentspace_trail';

const keyOf = (node, settings) =>
  node.kind === 'retro' ? `retro|${settings.model}|${node.stops.join('>')}` : pageKey(node, settings);

const readTrailOpen = () => {
  try {
    const saved = localStorage.getItem(TRAIL_KEY);
    if (saved) return saved === 'open';
  } catch {
    // no storage
  }
  return window.innerWidth >= 1000;
};

export default function App() {
  const settings = useSettings();
  const spend = useSpend();
  const journey = useJourney();
  const { state, current } = journey;
  const [live, setLive] = useState(null); // where the current page's write is: { id, draft, error }
  const [attempt, setAttempt] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trailOpen, setTrailOpen] = useState(readTrailOpen);
  const [query, setQuery] = useState('');
  const [queryFor, setQueryFor] = useState(null);

  const needsWriting = Boolean(current) && !current.page;
  const lensKey = current?.lens?.join('>') ?? '';

  // Whatever page the reader is on, it is written if it has not been yet: a new link, a shared
  // address, or a page revisited after its text was dropped. The cache joins a write already
  // started, such as a hovered link's, so a prefetched page shows at once.
  useEffect(() => {
    if (!needsWriting) return undefined;
    const node = current;
    const s = engineSettings();
    const key = keyOf(node, s);
    if (!has(key) && overBudget(settings.budget)) {
      setLive({ id: node.id, error: { message: 'The spending limit for this session is reached. Raise it in Settings to keep writing.', status: -1 } });
      return undefined;
    }
    const run = (onEvent) =>
      node.kind === 'retro'
        ? writeJourney({ stops: node.stops, settings: s, onEvent })
        : writeByFormat({ topic: node.topic, lens: node.lens, settings: s, onEvent });
    const entry = ensure(key, run);
    const off = entry.subscribe((snap) => {
      setLive({ id: node.id, draft: snap.draft, error: snap.error });
      if (snap.page) journey.fill(node.id, snap.page);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `journey.fill` is stable; the rest is named
  }, [current?.id, needsWriting, lensKey, attempt, settings.model, settings.linkModel, settings.depth, settings.apiKey]);

  const retry = () => {
    if (!current) return;
    forget(keyOf(current, engineSettings()));
    journey.rewrite(current.id);
    setAttempt((a) => a + 1);
  };

  // What is on screen: the finished page, or the text of the write in progress. A finished page is
  // drawn the way it was written, whatever the toggle says now. The toggle governs the next page.
  const mine = live?.id === current?.id ? live : null;
  const draft = mine?.draft;
  const format = current?.page?.format ?? (current?.kind === 'retro' ? 'a2ui' : (draft?.format ?? settings.format));
  const text = (format === 'html' ? current?.page?.html : current?.page?.compact) ?? draft?.text ?? '';
  // Both paths are drawn from the same kind of surface: compact lines are expanded into one, HTML is converted.
  const surface = useMemo(() => (format === 'html' ? htmlToSurface(text) : surfaceFrom(expandCompact(text).messages)), [format, text]);
  const error = !current?.page ? mine?.error : null;
  // Only the A2UI path has a second pass, so only it ever says it is choosing links.
  const choosingLinks = format === 'a2ui' && current?.kind === 'page' && draft?.final;
  const stage = !current?.page && !error ? (choosingLinks ? 'Choosing links' : 'Writing') : null;

  // Search box follows the page being shown.
  const shown = current ? current.topic : '';
  if (queryFor !== shown) {
    setQueryFor(shown);
    setQuery(current?.kind === 'page' ? shown : '');
  }

  useEffect(() => {
    document.title = current ? `${current.topic} · LatentSpace` : 'LatentSpace';
  }, [current]);
  useEffect(() => {
    document.documentElement.dataset.text = settings.text;
  }, [settings.text]);
  // The page canvas and scrollbars follow the app's mode, not only the operating system's.
  useEffect(() => {
    document.documentElement.style.colorScheme = settings.mode === 'system' ? 'light dark' : settings.mode;
  }, [settings.mode]);

  // A new page starts at the top; going back returns to where the reader was.
  const scrolls = useRef(new Map());
  const shownId = useRef(null);
  const remember = useCallback(() => scrolls.current.set(shownId.current, window.scrollY), []);
  useEffect(() => {
    shownId.current = current?.id ?? null;
    window.scrollTo({ top: scrolls.current.get(current?.id ?? null) ?? 0, behavior: 'instant' });
  }, [current?.id]);
  useEffect(() => {
    window.addEventListener('popstate', remember);
    return () => window.removeEventListener('popstate', remember);
  }, [remember]);

  const open = useCallback((spec) => {
    remember();
    journey.go(spec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remember, journey.go]);
  const follow = useCallback((topic) => open({ topic }), [open]); // a link: the lens carries on
  const search = (topic) => topic.trim() && open({ topic: topic.trim(), fresh: true }); // a search: a fresh start
  const home = () => {
    remember();
    journey.home();
  };
  const jump = useCallback((id) => {
    remember();
    journey.jump(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remember, journey.jump]);

  // Links carry the lens in their address, so a link opened in a new tab writes the same page.
  const hrefFor = useCallback(
    (topic) => urlFor({ kind: 'page', topic, lens: lensOf(state.nodes, state.currentId) }),
    [state.nodes, state.currentId],
  );
  const navigation = useMemo(() => ({ navigate: follow, hrefFor }), [follow, hrefFor]);

  // Hovering a link for a moment starts its page in the background (if the reader allows it).
  const hoverTimer = useRef(0);
  const onHover = useCallback(
    (topic) => {
      clearTimeout(hoverTimer.current);
      if (!topic || !settings.prefetch) return;
      hoverTimer.current = setTimeout(() => {
        const s = engineSettings();
        const lens = lensOf(state.nodes, state.currentId);
        if (!s.apiKey || overBudget(settings.budget)) return;
        ensure(
          pageKey({ topic, lens }, s),
          (onEvent) => writeByFormat({ topic, lens, settings: s, onEvent }),
          { prefetch: true },
        );
      }, PREFETCH_DELAY);
    },
    [settings.prefetch, settings.budget, state.nodes, state.currentId],
  );

  const rows = useMemo(() => treeRows(state), [state]);
  const stops = current ? stopsTo(state.nodes, current.id) : [];
  const journeys = rows
    .filter((r) => r.depth === 0 && r.node.page)
    .slice(-5)
    .reverse()
    .map((r) => ({ id: r.node.id, topic: r.node.topic, pages: rows.filter((x) => x.node.id === r.node.id || (x.depth > 0 && stopsTo(state.nodes, x.node.id)[0] === r.node.topic)).length }));

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const isDark = settings.mode === 'dark' || (settings.mode === 'system' && prefersDark);

  // The new theme spreads out from the button as a circle, where the browser can do it.
  const toggleDark = (event) => {
    const mode = isDark ? 'light' : 'dark';
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || calm) return saveSettings({ mode });
    const box = event?.currentTarget?.getBoundingClientRect?.();
    document.documentElement.style.setProperty('--vt-x', `${box ? box.left + box.width / 2 : window.innerWidth - 40}px`);
    document.documentElement.style.setProperty('--vt-y', `${box ? box.top + box.height / 2 : 24}px`);
    document.startViewTransition(() => flushSync(() => saveSettings({ mode })));
    return undefined;
  };

  const toggleTrail = () => {
    setTrailOpen((open) => {
      try {
        localStorage.setItem(TRAIL_KEY, open ? 'closed' : 'open');
      } catch {
        // no storage
      }
      return !open;
    });
  };

  return (
    <Theme theme={neutralTheme} mode={settings.mode}>
      <NavigationProvider value={navigation}>
       <div className="app">
        <Shell
          query={query}
          onQuery={setQuery}
          onSearch={search}
          onHome={home}
          onBack={journey.back}
          onForward={journey.forward}
          canGoBack={journey.canGoBack}
          canGoForward={journey.canGoForward}
          spend={spend}
          unusedPrefetch={unusedPrefetchCost()}
          isDark={isDark}
          onToggleDark={toggleDark}
          trailOpen={trailOpen}
          onToggleTrail={toggleTrail}
          onSettings={() => setSettingsOpen(true)}
          format={settings.format}
          onFormat={(next) => saveSettings({ format: next })}
        />

        <div className={`stage${trailOpen ? ' has-trail' : ''}`}>
          {trailOpen && (
            <aside className="trail-col" aria-label="Trail">
              <Trail
                rows={rows}
                currentId={current?.id}
                canRetro={current?.kind === 'page' && stops.length >= 2 && !needsWriting}
                onJump={jump}
                onRetro={() => open({ kind: 'retro', topic: RETRO_TITLE, stops })}
                onClear={journey.reset}
              />
            </aside>
          )}

          <main>
            {current ? (
              <Reader
                key={current.id}
                node={current}
                format={format}
                surface={surface}
                stage={stage}
                streaming={stage === 'Writing'}
                error={error}
                truncated={current.page?.truncated}
                linkError={current.page?.linkError}
                metrics={current.page?.metrics}
                onExplore={follow}
                onRetry={retry}
                onFresh={() => {
                  forget(keyOf(current, engineSettings()));
                  journey.rewrite(current.id, []);
                }}
                onSettings={() => setSettingsOpen(true)}
                onHover={onHover}
              />
            ) : (
              <Launchpad hasKey={Boolean(getApiKey())} journeys={journeys} onOpen={search} onJump={jump} onSettings={() => setSettingsOpen(true)} />
            )}
          </main>
        </div>

        <footer className="foot">
          <Button label="About LatentSpace" variant="ghost" size="sm" onClick={() => open({ topic: ABOUT_TOPIC, fresh: true })} />
        </footer>

        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
       </div>
      </NavigationProvider>
    </Theme>
  );
}
