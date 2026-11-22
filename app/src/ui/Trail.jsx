import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { useT } from '../i18n/index.js';

/** The journey as a tree. Go back and follow a different link and the path forks. */
export function Trail({ rows, currentId, canRetro, onJump, onRetro, onClear }) {
  const t = useT();
  return (
    <Card padding={3}>
      <Heading level={3}>{t('trail.title')}</Heading>
      {rows.length === 0 ? (
        <Text type="supporting" color="secondary" display="block">
          {t('trail.empty')}
        </Text>
      ) : (
        <ul className="trail" aria-label={t('trail.list')}>
          {rows.map(({ node, depth, siblings }) => (
            <li key={node.id} style={{ paddingInlineStart: depth * 14 }}>
              <button
                type="button"
                className="trail-row"
                aria-current={node.id === currentId ? 'page' : undefined}
                onClick={() => onJump(node.id)}
              >
                {depth > 0 && siblings > 1 && <span aria-label={t('trail.branch')} title={t('trail.branchHint')}>⑂ </span>}
                {node.kind === 'retro' && <span aria-hidden="true">◇ </span>}
                {node.topic}
                {!node.page && <span className="dim"> …</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="trail-actions">
        <Button label={t('trail.retro')} size="sm" isDisabled={!canRetro} onClick={onRetro} />
        <Button label={t('trail.clear')} size="sm" variant="ghost" isDisabled={rows.length === 0} onClick={onClear} />
      </div>
    </Card>
  );
}
