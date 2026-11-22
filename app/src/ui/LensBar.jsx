import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { useT } from '../i18n/index.js';

/**
 * The path this page was written through. A page is written "as it relates to" its lens, so the
 * lens is shown, and it can be dropped to write the page again from a fresh start.
 */
export function LensBar({ lens, onFresh }) {
  const t = useT();
  if (!lens?.length) return null;
  return (
    <nav aria-label={t('lens.path')} className="lens">
      <Text type="supporting" color="secondary">{t('lens.label')}</Text>
      <ol>
        {lens.map((topic, i) => (
          <li key={`${i}-${topic}`}>
            <Badge variant="neutral" label={topic} />
            <span aria-hidden="true"> › </span>
          </li>
        ))}
      </ol>
      <Button label={t('lens.fresh')} size="sm" variant="ghost" onClick={onFresh} tooltip={t('lens.freshHint')} />
    </nav>
  );
}
