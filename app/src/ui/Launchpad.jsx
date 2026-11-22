import { useEffect, useState } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { SPARE_STARTERS, sample, writeStarters } from '../engine/pipeline.js';
import { engineSettings } from '../state/settings.js';
import { addSpend } from '../state/spend.js';

// One request per page load. Coming back to the launchpad reuses its answer.
let request = null;
let answer = null;

/** Six starting points written by the model for this page load, or null while they are on their way. */
function useStarters(enabled) {
  const [topics, setTopics] = useState(answer);
  useEffect(() => {
    if (!enabled || answer) return undefined;
    let shown = true;
    request ??= writeStarters({ settings: engineSettings() })
      .then((result) => {
        addSpend(result.cost);
        return result.topics;
      })
      .catch(() => sample(SPARE_STARTERS, 6));
    request.then((list) => {
      answer = list;
      if (shown) setTopics(list);
    });
    return () => {
      shown = false;
    };
  }, [enabled]);
  return topics;
}

const WIDTHS = [96, 128, 112, 144, 104, 120];

export function Launchpad({ hasKey, journeys, onOpen, onJump, onSettings }) {
  const starters = useStarters(hasKey);
  return (
    <section className="launchpad">
      <Text type="label" color="accent">The encyclopedia of latents</Text>
      <Heading level={1} type="display-2">Every page is written the moment you ask for it</Heading>
      <Text type="large" color="secondary" display="block">
        The model is the browser engine. Every link opens a page that did not exist until you clicked, written with the
        path you took as its context. Search above, or start somewhere.
      </Text>

      {hasKey ? (
        <>
          <ul className="starters" aria-busy={!starters} aria-label="Places to start">
            {starters
              ? starters.map((topic) => (
                  <li key={topic}>
                    <Button label={topic} onClick={() => onOpen(topic)} />
                  </li>
                ))
              : WIDTHS.map((w) => (
                  <li key={w} aria-hidden="true">
                    <Skeleton width={w} height={40} radius={3} />
                  </li>
                ))}
          </ul>

          {journeys.length > 0 && (
            <div className="recent">
              <Text type="label">Pick up a journey</Text>
              <ul>
                {journeys.map((j) => (
                  <li key={j.id}>
                    <Button label={`${j.topic} · ${j.pages} ${j.pages === 1 ? 'page' : 'pages'}`} variant="ghost" size="sm" onClick={() => onJump(j.id)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <Banner
          status="info"
          title="Add your Cerebras API key to start exploring"
          description="It stays in this browser and is sent only to Cerebras."
          container="card"
          collapsible={false}
          endContent={<Button label="Add API key" variant="primary" onClick={onSettings} />}
        />
      )}
    </section>
  );
}
