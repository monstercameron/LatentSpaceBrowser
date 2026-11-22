import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';

/** Select any text in the page and explore it as a topic. Positioned over the selection inside `boxRef`. */
export function SelectionExplore({ boxRef, onExplore }) {
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    const update = () => {
      const selected = window.getSelection();
      const text = selected?.toString().replace(/\s+/g, ' ').trim();
      const box = boxRef.current;
      if (!text || !box || selected.isCollapsed || !box.contains(selected.getRangeAt(0).commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const rect = selected.getRangeAt(0).getBoundingClientRect();
      const origin = box.getBoundingClientRect();
      setSelection({ text: text.slice(0, 80), top: rect.top - origin.top, left: rect.left - origin.left + rect.width / 2 });
    };
    document.addEventListener('mouseup', update);
    document.addEventListener('keyup', update);
    return () => {
      document.removeEventListener('mouseup', update);
      document.removeEventListener('keyup', update);
    };
  }, [boxRef]);

  if (!selection) return null;
  const label = selection.text.length > 28 ? `${selection.text.slice(0, 27)}…` : selection.text;
  return (
    // mousedown must not clear the selection before the click lands
    <div className="selection-explore" style={{ top: selection.top, left: selection.left }} onMouseDown={(e) => e.preventDefault()}>
      <Button
        label={`Explore “${label}”`}
        size="sm"
        variant="primary"
        onClick={() => {
          window.getSelection()?.removeAllRanges();
          setSelection(null);
          onExplore(selection.text);
        }}
      />
    </div>
  );
}
