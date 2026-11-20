import { Icon } from './Icon.jsx';

// Keeps the text selected while a button is pressed.
const keepSelection = (event) => event.preventDefault();

export function SelectionPopup({ selection, href, onExplore, onDone }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(selection.text);
    } catch {
      // clipboard permission denied: nothing to do
    }
    onDone();
  };

  return (
    <div
      className="absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-lg border border-edge bg-card p-1 font-sans shadow-lg"
      style={{ top: selection.top - 8, left: `clamp(7rem, ${selection.left}px, calc(100% - 7rem))` }}
      onMouseDown={keepSelection}
    >
      <button
        type="button"
        onClick={onExplore}
        className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-card"
      >
        <Icon name="compass" size={14} /> Explore
      </button>
      <a href={href} target="_blank" rel="noopener" onClick={onDone} className="icon-btn" aria-label="Open in new tab" title="Open in new tab">
        <Icon name="external" size={15} />
      </a>
      <button type="button" onClick={copy} className="icon-btn" aria-label="Copy text" title="Copy text">
        <Icon name="copy" size={15} />
      </button>
    </div>
  );
}
