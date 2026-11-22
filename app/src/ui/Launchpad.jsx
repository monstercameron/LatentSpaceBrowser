import { useEffect, useState } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { SPARE_STARTERS, sample, writeStarters } from '../engine/pipeline.js';
import { useT } from '../i18n/index.js';
import { engineSettings } from '../state/settings.js';
import { addSpend } from '../state/spend.js';

// One request per page load and language. Coming back to the launchpad reuses its answer.
let request = null;
let answer = null;
let answeredFor = null;

/** Six starting points written by the model for this page load, or null while they are on their way. */
function useStarters(enabled, languageId) {
  const [topics, setTopics] = useState(answeredFor === languageId ? answer : null);
  useEffect(() => {
    if (!enabled) return undefined;
    if (answeredFor !== languageId) {
      answer = null;
      request = null;
      answeredFor = languageId;
    }
    if (answer) {
      setTopics(answer);
      return undefined;
    }
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
  }, [enabled, languageId]);
  return topics;
}

const WIDTHS = [96, 128, 112, 144, 104, 120];

export function Launchpad({ hasKey, languageId, journeys, onOpen, onJump, onSettings }) {
  const t = useT();
  const starters = useStarters(hasKey, languageId);
  return (
    <section className="launchpad">
      <Text type="label" color="accent">{t('launch.kicker')}</Text>
      <Heading level={1} type="display-2">{t('launch.title')}</Heading>
      <Text type="large" color="secondary" display="block">
        {t('launch.body')}
      </Text>

      {hasKey ? (
        <>
          <ul className="starters" aria-busy={!starters} aria-label={t('launch.starters')}>
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
              <Text type="label">{t('launch.resume')}</Text>
              <ul>
                {journeys.map((j) => (
                  <li key={j.id}>
                    <Button label={t('launch.journey', { topic: j.topic, n: j.pages })} variant="ghost" size="sm" onClick={() => onJump(j.id)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <Banner
          status="info"
          title={t('launch.keyTitle')}
          description={t('launch.keyBody')}
          container="card"
          collapsible={false}
          endContent={<Button label={t('launch.keyButton')} variant="primary" onClick={onSettings} />}
        />
      )}
    </section>
  );
}
