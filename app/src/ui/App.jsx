import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@astryxdesign/core/Button';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { NavigationProvider } from '../a2ui/catalog.jsx';
import { registerWebMcp } from '../agent/webmcp.js';
import { applyA11y } from '../engine/a11y.js';
import { surfaceFrom } from '../a2ui/surface.js';
import { expandCompact } from '../engine/compact.js';
import { applyLanguage, useT } from '../i18n/index.js';
import { errorText } from '../i18n/errors.js';
import { ensure, forget, has, unusedPrefetchCost } from '../state/cache.js';
import { stopsTo, treeRows } from '../state/journey.js';
import { translatePage } from '../engine/translatePage.js';
import { summarize } from '../engine/pipeline.js';
import { keyFor } from '../engine/models.js';
import { currentLanguage, engineSettings, keysReady, saveSettings, useSettings } from '../state/settings.js';
import { overBudget, useSpend } from '../state/spend.js';
import { languageKey, lensOf, pageKey, urlFor } from '../state/topics.js';
import { useJourney } from '../state/useJourney.js';
import { htmlToSurface } from './htmlSurface.js';
import { Launchpad } from './Launchpad.jsx';
import { Reader } from './Reader.jsx';
import { runPage } from './runPage.js';
import { SettingsDialog } from './SettingsDialog.jsx';
import { Shell } from './Shell.jsx';
import { Trail } from './Trail.jsx';

const PREFETCH_DELAY = 300; // a hover has to mean it
const TRAIL_KEY = 'latentspace_trail';

// A retrospective is the same page for the same path, model, language and accessibility setting.
const keyOf = (node, settings) =>
  node.kind === 'retro'
    ? `retro|${settings.model}|${languageKey(settings)}|${settings.a11y ? 'a11y' : ''}|${node.stops.join('>')}`
    : pageKey(node, settings);

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
  const t = useT();
  const spend = useSpend();
  const journey = useJourney();
  const { state, current } = journey;
  const [live, setLive] = useState(null); // where the current page's write is: { id, draft, error }
  const [attempt, setAttempt] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusLanguage, setFocusLanguage] = useState(false); // opened from "Other language…": go straight to its box
  const [trailOpen, setTrailOpen] = useState(readTrailOpen);
  const [query, setQuery] = useState('');
  const [queryFor, setQueryFor] = useState(null);
  const [trError, setTrError] = useState(null); // a translation that failed: { id, key, message }

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
      setLive({ id: node.id, error: { code: 'budget', message: 'The spending limit for this session is reached.', status: -1 } });
      return undefined;
    }
    const entry = ensure(key, (onEvent) => runPage({ node, settings: s, onEvent }));
    const off = entry.subscribe((snap) => {
      setLive({ id: node.id, draft: snap.draft, error: snap.error });
      if (snap.page) journey.fill(node.id, snap.page);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `journey.fill` is stable; the rest is named
  }, [current?.id, needsWriting, lensKey, attempt, settings.model, settings.linkModel, settings.depth, settings.apiKey, settings.openaiKey, settings.language, settings.a11y]);

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
  // A page keeps the language it was written in; the same page in another language is its translation, stored
  // beside it. Until a translation arrives the reader keeps reading what they were reading.
  const wantKey = languageKey(engineSettings());
  const page = current?.page;
  // Pages written before translations existed have no langKey; their language code says what they are written in.
  const isOriginal = page && (page.langKey ? page.langKey === wantKey : (page.lang?.code ?? 'en') === (currentLanguage().code ?? 'en'));
  const variant = page ? (isOriginal ? page : page.translations?.[wantKey] ?? null) : null;
  const view = variant ?? page;
  const translating = Boolean(page) && !variant;
  const trFailed = trError && trError.id === current?.id && trError.key === wantKey ? trError : null;
  const format = view?.format ?? (current?.kind === 'retro' ? 'a2ui' : (draft?.format ?? settings.format));
  const text = (format === 'html' ? view?.html : view?.compact) ?? draft?.text ?? '';
  // Both paths are drawn from the same kind of surface: compact lines are expanded into one, HTML is converted.
  // A page that had the accessibility pass gets its annotations applied on top (they are stored beside it).
  const a11y = view?.a11y;
  const surface = useMemo(() => {
    const base = format === 'html' ? htmlToSurface(text) : surfaceFrom(expandCompact(text).messages);
    return a11y ? applyA11y(base, a11y).surface : base;
  }, [format, text, a11y]);
  const error = !current?.page ? mine?.error : null;
  // Which pass is running. Only the A2UI path has a link pass, so only it ever says it is choosing links.
  const phase = !current?.page && !error
    ? draft?.stage === 'a11y' ? 'access'
      : draft?.stage === 'links' || (format === 'a2ui' && current?.kind === 'page' && draft?.final) ? 'linking'
        : 'writing'
    : null;
  const stage = translating && !trFailed ? t('page.translating') : phase ? t(`page.${phase === 'writing' ? 'writing' : phase === 'linking' ? 'linking' : 'access'}`) : null;

  // The language was switched on a page that is already written: translate that page, keeping its wording and
  // its links. The result is stored under its language, so switching back (or on again) costs nothing.
  const translateBy = useRef(0);
  useEffect(() => {
    if (!translating) return;
    const node = current;
    const key = wantKey;
    const s = engineSettings();
    if (!keysReady(s)) return setTrError({ id: node.id, key, message: t('error.key') });
    const source = node.page.format === 'html' ? node.page.html : node.page.compact;
    const entryKey = `tr|${node.id}|${key}|${s.model}|${s.linkModel}|${source.length}:${node.page.metrics.cost}`;
    if (!has(entryKey) && overBudget(settings.budget)) return setTrError({ id: node.id, key, message: t('error.budget') });
    setTrError(null);
    const entry = ensure(entryKey, async () => {
      const result = await translatePage({ page: node.page, settings: s });
      return result;
    });
    let off = null;
    let finished = false;
    const done = (snap) => {
      if (!snap.settled || finished) return;
      finished = true;
      if (snap.page) {
        const r = snap.page;
        const variant = { format: node.page.format, [node.page.format === 'html' ? 'html' : 'compact']: r.text, a11y: r.a11y, lang: r.lang, translation: r.metrics, metrics: summarize([...node.page.metrics.passes, ...r.metrics.passes]) };
        journey.translated(node.id, key, variant);
      } else if (snap.error) setTrError({ id: node.id, key, message: errorText(snap.error, t) });
      off?.();
    };
    off = entry.subscribe(done);
    if (finished) off();
    translateBy.current += 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the page, its target language and the models are the inputs
  }, [current?.id, translating, wantKey, settings.model, settings.linkModel, settings.apiKey, settings.openaiKey, attempt]);


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

  // The language of the app: its text, the document's `lang`, and the direction it reads in.
  // Ready-made and cached languages are instant; a custom one that is not yet cached is translated by the model.
  const language = currentLanguage();
  useEffect(() => {
    const s = engineSettings();
    applyLanguage(language, { apiKey: keyFor(s, s.model), modelId: s.model });
    document.documentElement.lang = language.code ?? '';
    document.documentElement.dir = language.rtl ? 'rtl' : 'ltr';
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `language` is derived from these two settings
  }, [settings.language, settings.customLanguage]);
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
        if (!keysReady(s) || overBudget(settings.budget)) return;
        ensure(
          pageKey({ topic, lens }, s),
          (onEvent) => runPage({ node: { kind: 'page', topic, lens }, settings: s, onEvent }),
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

  // WebMCP: agents in the browser get the same moves a reader has. The tools read the latest state through a
  // ref, so they are registered once and always see the page as it is now.
  const live_ = useRef(null);
  live_.current = {
    node: current,
    surface,
    error,
    spend,
    budget: settings.budget,
    hasKey: keysReady(),
    translating: translating && !trFailed,
    canGoBack: journey.canGoBack,
    canGoForward: journey.canGoForward,
    preferences: { language: settings.language, format: settings.format, depth: settings.depth, accessibility: settings.a11y, theme: settings.mode, text_size: settings.text },
    trail: rows.map((r) => ({ id: r.node.id, topic: r.node.topic, depth: r.depth, current: r.node.id === current?.id, written: Boolean(r.node.page) })),
    go: (spec) => { remember(); return journey.go(spec); },
    journey,
  };
  useEffect(
    () =>
      registerWebMcp({
        read: () => live_.current,
        trail: () => live_.current.trail,
        search: (topic) => live_.current.go({ topic, fresh: true }),
        follow: (topic) => live_.current.go({ topic }),
        home: () => live_.current.journey.home(),
        back: () => live_.current.journey.back(),
        forward: () => live_.current.journey.forward(),
        jump: (id) => live_.current.journey.jump(id),
        save: saveSettings,
      }),
    [],
  );

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
          onSettings={() => {
            setFocusLanguage(false);
            setSettingsOpen(true);
          }}
          format={settings.format}
          onFormat={(next) => saveSettings({ format: next })}
          language={settings.language}
          customLanguage={settings.customLanguage}
          onLanguage={(id) => saveSettings({ language: id })}
          onOtherLanguage={() => {
            setFocusLanguage(true);
            setSettingsOpen(true);
          }}
        />

        <div className={`stage${trailOpen ? ' has-trail' : ''}`}>
          {trailOpen && (
            <aside className="trail-col" aria-label={t('trail.title')}>
              <Trail
                rows={rows}
                currentId={current?.id}
                canRetro={current?.kind === 'page' && stops.length >= 2 && !needsWriting}
                onJump={jump}
                onRetro={() => open({ kind: 'retro', topic: t('retro.title'), stops })}
                onClear={journey.reset}
                onRemove={journey.remove}
              />
            </aside>
          )}

          <main>
            {current ? (
              <Reader
                key={`${current.id}|${variant && variant !== page ? wantKey : ''}`}
                node={current}
                format={format}
                surface={surface}
                stage={stage}
                streaming={phase === 'writing'}
                error={error}
                pageLang={view?.lang}
                truncated={current.page?.truncated}
                linkError={current.page?.linkError}
                metrics={view?.metrics}
                notice={trFailed ? t('error.translate', { message: trFailed.message }) : null}
                onRetranslate={() => {
                  forget(`tr|${current.id}|${wantKey}`);
                  setTrError(null);
                  setAttempt((a) => a + 1);
                }}
                onExplore={follow}
                onRetry={retry}
                onFresh={() => {
                  forget(keyOf(current, engineSettings()));
                  journey.rewrite(current.id, []);
                }}
                onSettings={() => {
                  setFocusLanguage(false);
                  setSettingsOpen(true);
                }}
                onHover={onHover}
              />
            ) : (
              <Launchpad
                hasKey={keysReady()}
                languageId={languageKey(engineSettings())}
                journeys={journeys}
                onOpen={search}
                onJump={jump}
                onSettings={() => {
                  setFocusLanguage(false);
                  setSettingsOpen(true);
                }}
              />
            )}
          </main>
        </div>

        <footer className="foot">
          <Button label={t('footer.about')} variant="ghost" size="sm" onClick={() => open({ topic: t('footer.about'), fresh: true, about: true })} />
        </footer>

        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} focusLanguage={focusLanguage} />}
       </div>
      </NavigationProvider>
    </Theme>
  );
}
