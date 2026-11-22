import { Blockquote } from '@astryxdesign/core/Blockquote';
import { Heading } from '@astryxdesign/core/Heading';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Inline } from './Inline.jsx';
import { useReveal } from './navigation.js';
import { childrenOf } from './surface.js';

export { NavigationProvider, RevealProvider, useNavigation } from './navigation.js';

// The catalog: which Astryx component draws each A2UI component the page can contain.
//   Column -> its children      Heading -> Heading      Prose -> a paragraph of words and links
//   Facts  -> MetadataList      List    -> a list       Quote -> Blockquote
//   Table  -> a table           Code    -> a code block
// A component the catalog does not know is skipped, never drawn as markup.

export function Prose({ text, tail }) {
  return (
    <p className="prose">
      <Inline text={text} tail={tail} />
    </p>
  );
}

export function Facts({ items }) {
  return (
    <MetadataList title="Key facts" label={{ position: 'top' }}>
      {items.map((item, i) => (
        <MetadataListItem key={i} label={item.label}>
          <Inline text={item.value} />
        </MetadataListItem>
      ))}
    </MetadataList>
  );
}

/** One component of the surface, and everything under it. */
export function Block({ surface, id }) {
  const { tailId } = useReveal();
  const c = surface.components[id];
  if (!c) return null;
  switch (c.component) {
    case 'Column':
      return childrenOf(surface, id).map((childId) => <Block key={childId} surface={surface} id={childId} />);
    case 'Heading':
      return (
        <Heading level={[1, 2, 3].includes(c.level) ? c.level : 2} id={`sec-${c.id}`}>
          {c.text}
        </Heading>
      );
    case 'Prose':
      return <Prose text={c.text} tail={tailId === id} />;
    case 'Facts':
      return <Facts items={c.items} />;
    case 'List': {
      const Tag = c.ordered ? 'ol' : 'ul';
      return (
        <Tag className="latent-list">
          {c.items.map((item, i) => (
            <li key={i}>
              <Inline text={item} tail={tailId === id && i === c.items.length - 1} />
            </li>
          ))}
        </Tag>
      );
    }
    case 'Table':
      return (
        <div className="latent-table-wrap">
          <table className="latent-table">
            {c.headers?.length > 0 && (
              <thead>
                <tr>
                  {c.headers.map((h, i) => (
                    <th key={i}>
                      <Inline text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {c.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'Code':
      return (
        <pre className="latent-code">
          <code>{c.text}</code>
        </pre>
      );
    case 'Quote':
      return (
        <Blockquote>
          <Inline text={c.text} tail={tailId === id} />
        </Blockquote>
      );
    default:
      return null;
  }
}
