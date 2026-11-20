import { useEffect, useMemo, useRef, useState } from 'react';
import { renderPage } from '../lib/html.js';
import { child } from '../lib/topics.js';
import { SelectionPopup } from './SelectionPopup.jsx';

const plainClick = (event) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export function Article({ html, topic = '', onNavigate, journey = false }) {
  const boxRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const safeHtml = useMemo(() => renderPage(html, topic, { rail: !journey }), [html, topic, journey]);

  // Offer "Explore" for any text selected inside the page.
  useEffect(() => {
    const update = () => {
      const selected = window.getSelection();
      const text = selected?.toString().trim();
      const box = boxRef.current;
      if (!text || !box || selected.isCollapsed || !box.contains(selected.getRangeAt(0).commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const rect = selected.getRangeAt(0).getBoundingClientRect();
      const origin = box.getBoundingClientRect();
      setSelection({
        text: text.slice(0, 120),
        top: rect.top - origin.top,
        left: rect.left - origin.left + rect.width / 2,
      });
    };
    document.addEventListener('mouseup', update);
    document.addEventListener('keyup', update);
    return () => {
      document.removeEventListener('mouseup', update);
      document.removeEventListener('keyup', update);
    };
  }, []);

  // Internal links are real URLs (so new-tab works) but a plain click stays in the app.
  const followLink = (event) => {
    // Contents links scroll within the page and leave the address bar alone.
    const jump = event.target.closest('.toc a');
    if (jump) {
      event.preventDefault();
      document.getElementById(jump.hash.slice(1))?.scrollIntoView();
      return;
    }
    const link = event.target.closest('a[data-topic]');
    if (!link || !plainClick(event)) return;
    event.preventDefault();
    onNavigate(link.dataset.topic);
  };

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };
  const selectedTopic = selection ? child(topic, selection.text) : '';

  return (
    <div ref={boxRef} className="relative">
      <div className={journey ? 'article journey' : 'article'} onClick={followLink} dangerouslySetInnerHTML={{ __html: safeHtml }} />
      {selection && (
        <SelectionPopup
          selection={selection}
          href={`?topic=${encodeURIComponent(selectedTopic)}`}
          onDone={clearSelection}
          onExplore={() => {
            clearSelection();
            onNavigate(selectedTopic);
          }}
        />
      )}
    </div>
  );
}
