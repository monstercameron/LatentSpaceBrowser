import { useEffect, useState } from 'react';

const LINE = 110; // px from the top of the window: just under the sticky header, where reading begins

/** The section pick for a scroll position: the last heading that has reached the reading line, or the last one at the page's end. */
export function pickActive(tops, atEnd) {
  if (!tops.length) return null;
  if (atEnd) return tops.at(-1).id;
  let active = null;
  for (const { id, top } of tops) if (top <= LINE) active = id;
  return active;
}

/** The id of the section being read: follows the scroll, for the contents list to highlight. `ids` are heading element ids. */
export function useActiveSection(ids) {
  const [active, setActive] = useState(null);
  const key = ids.join('|');
  useEffect(() => {
    if (!ids.length) return undefined;
    // A dozen rectangles per scroll event: cheap enough to read directly, and no frame has to be waited for.
    const measure = () => {
      const tops = ids.flatMap((id) => {
        const el = document.getElementById(id);
        return el ? [{ id, top: el.getBoundingClientRect().top }] : [];
      });
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(pickActive(tops, atEnd));
    };
    const onScroll = measure;
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the list of ids
  }, [key]);
  return active;
}
