import { useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

const isTyping = (target) => target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

export function Header({
  query,
  onQuery,
  onSearch,
  onHome,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  dark,
  onToggleDark,
  onSettings,
  busy,
}) {
  const searchRef = useRef(null);

  // "/" jumps to the search box, as on most reference sites.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      searchRef.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const topic = query.trim();
    if (!topic) return;
    searchRef.current?.blur();
    onSearch(topic);
  };
  const themeLabel = dark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <header className="glass sticky top-0 z-20 border-b border-line">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-1 gap-y-2 px-3 py-2.5 sm:flex-nowrap sm:gap-x-2 sm:px-4">
        <button
          type="button"
          onClick={onHome}
          className="rounded px-1 font-serif text-xl font-bold tracking-tight"
          title="Home (ends the journey)"
        >
          Latent<span className="font-normal">Space</span>
        </button>

        <nav aria-label="History" className="flex">
          <button type="button" className="icon-btn" onClick={onBack} disabled={!canGoBack} aria-label="Back" title="Back">
            <Icon name="back" />
          </button>
          <button type="button" className="icon-btn" onClick={onForward} disabled={!canGoForward} aria-label="Forward" title="Forward">
            <Icon name="forward" />
          </button>
        </nav>

        <form role="search" onSubmit={submit} className="relative order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-0">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search any topic"
            aria-label="Search any topic"
            enterKeyHint="search"
            className="field pl-9 sm:pr-9"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-edge px-1.5 font-mono text-xs text-muted sm:block"
          >
            /
          </kbd>
        </form>

        <button
          type="button"
          className="icon-btn ml-auto sm:ml-0"
          onClick={onToggleDark}
          aria-label={themeLabel}
          title={themeLabel}
        >
          <Icon name={dark ? 'sun' : 'moon'} />
        </button>
        <button type="button" className="icon-btn" onClick={onSettings} aria-label="Settings" title="Settings">
          <Icon name="settings" />
        </button>
      </div>
      {busy && <div className="progress" role="progressbar" aria-label="Generating page" />}
    </header>
  );
}
