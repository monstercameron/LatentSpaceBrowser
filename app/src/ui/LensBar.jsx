import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';

/**
 * The path this page was written through. A page is written "as it relates to" its lens, so the
 * lens is shown, and it can be dropped to write the page again from a fresh start.
 */
export function LensBar({ lens, onFresh }) {
  if (!lens?.length) return null;
  return (
    <nav aria-label="Path here" className="lens">
      <Text type="supporting" color="secondary">Written as it relates to</Text>
      <ol>
        {lens.map((topic, i) => (
          <li key={`${i}-${topic}`}>
            <Badge variant="neutral" label={topic} />
            <span aria-hidden="true"> › </span>
          </li>
        ))}
      </ol>
      <Button label="Start fresh" size="sm" variant="ghost" onClick={onFresh} tooltip="Write this page again with no path behind it" />
    </nav>
  );
}
