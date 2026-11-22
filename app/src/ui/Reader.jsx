import { useMemo, useRef } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { Block, Facts, RevealProvider } from '../a2ui/catalog.jsx';
import { childrenOf, headingsOf } from '../a2ui/surface.js';
import { LensBar } from './LensBar.jsx';
import { Receipt } from './Receipt.jsx';
import { SelectionExplore } from './SelectionExplore.jsx';

const topicOf = (anchor) => new URLSearchParams(anchor.getAttribute('href').replace(/^[^?]*/, '')).get('topic');
const MIN_SECTIONS_FOR_CONTENTS = 3;

function Loading() {
  return (
    <div className="skeleton" aria-hidden="true">
      <Skeleton width="55%" height={36} />
      {[100, 96, 88, 100, 72].map((w, i) => (
        <Skeleton key={i} width={`${w}%`} height={16} index={i} />
      ))}
    </div>
  );
}

/**
 * A page: lens, title, prose with links, a side rail of facts and contents, and its receipt.
 * It is drawn from an A2UI `surface` through the Astryx catalog, whichever path wrote it: the compact
 * path's pages are expanded into one, and the HTML path's are converted into one (ui/htmlSurface.js).
 * `format` only says which path made the page, for its receipt.
 */
export function Reader({
  node, format, surface, stage, streaming, error, truncated, linkError, metrics,
  onExplore, onRetry, onFresh, onSettings, onHover,
}) {
  const boxRef = useRef(null);
  const components = surface.components;
  const rootKids = childrenOf(surface, 'root');
  const titleId = rootKids.find((id) => components[id].component === 'Heading' && components[id].level === 1);
  const factsId = rootKids.find((id) => components[id].component === 'Facts');
  const bodyIds = rootKids.filter((id) => id !== titleId && id !== factsId);

  const sections = headingsOf(surface);
  const hasText = rootKids.length > 0;
  // Only sections count toward showing a contents list; sub-sections nest beneath them.
  const showContents = sections.filter((s) => s.level === 2).length >= MIN_SECTIONS_FOR_CONTENTS;
  // While the page is being written, new words spawn, and a caret marks the block they are joining.
  const tailId = bodyIds.at(-1) ?? null;
  const reveal = useMemo(() => ({ streaming: Boolean(streaming), tailId }), [streaming, tailId]);

  const hover = (e) => {
    const anchor = e.target.closest?.('a[href*="topic="]');
    onHover?.(anchor ? topicOf(anchor) : null);
  };

  return (
    <article className="reader-page" aria-busy={Boolean(stage)}>
      <LensBar lens={node.lens} onFresh={onFresh} />

      {error && (
        <div className="alert">
          <Banner
            status="error"
            title="This page could not be written"
            description={error.message}
            container="card"
            collapsible={false}
            endContent={
              <>
                {/* no answer, a rejected key, or the spending limit (status -1): all are fixed in Settings */}
                {[-1, 0, 401, 403].includes(error.status) && <Button label="Open settings" size="sm" onClick={onSettings} />}
                <Button label="Try again" size="sm" variant="primary" onClick={onRetry} />
              </>
            }
          />
        </div>
      )}

      {!hasText && !error && <Loading />}

      {hasText && (
        <RevealProvider value={reveal}>
          <div className="reader">
            <div className="reader-main" ref={boxRef} onPointerOver={hover} onPointerOut={() => onHover?.(null)} onFocus={hover} onBlur={() => onHover?.(null)}>
              {stage && (
                <Text type="supporting" color="accent" role="status" className="stage">
                  {stage}…
                </Text>
              )}
              <Heading level={1}>{components[titleId]?.text ?? node.topic}</Heading>
              <div className="article">
                {bodyIds.map((id) => (
                  <Block key={id} surface={surface} id={id} />
                ))}
              </div>
              {truncated && (
                <div className="alert">
                  <Banner
                    status="warning"
                    title="This page ran into its length limit"
                    container="card"
                    collapsible={false}
                    endContent={<Button label="Write it again" size="sm" onClick={onRetry} />}
                  />
                </div>
              )}
              <SelectionExplore boxRef={boxRef} onExplore={onExplore} />
            </div>

            <aside className="rail" aria-label="About this page">
              {factsId && (
                <Card padding={3}>
                  <Facts items={components[factsId].items} />
                </Card>
              )}
              {showContents && (
                <nav aria-label="On this page" className="contents">
                  <Text type="label">On this page</Text>
                  <ol>
                    {sections.map((section) => (
                      <li key={section.id} className={section.level === 3 ? 'sub' : undefined}>
                        <a
                          href={`#sec-${section.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            document.getElementById(`sec-${section.id}`)?.scrollIntoView();
                          }}
                        >
                          {section.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
            </aside>
          </div>
        </RevealProvider>
      )}

      {!stage && <Receipt metrics={metrics} linkError={linkError} format={format} />}
    </article>
  );
}
