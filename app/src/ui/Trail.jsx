import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';

/** The journey as a tree. Go back and follow a different link and the path forks. */
export function Trail({ rows, currentId, canRetro, onJump, onRetro, onClear }) {
  return (
    <Card padding={3}>
      <Heading level={3}>Trail</Heading>
      {rows.length === 0 ? (
        <Text type="supporting" color="secondary" display="block">
          Pages you open appear here as a tree. Go back and follow a different link to start a branch.
        </Text>
      ) : (
        <ul className="trail" aria-label="Pages in this journey">
          {rows.map(({ node, depth, siblings }) => (
            <li key={node.id} style={{ paddingInlineStart: depth * 14 }}>
              <button
                type="button"
                className="trail-row"
                aria-current={node.id === currentId ? 'page' : undefined}
                onClick={() => onJump(node.id)}
              >
                {depth > 0 && siblings > 1 && <span aria-label="branch" title="A branch: one of several links followed from the same page">⑂ </span>}
                {node.kind === 'retro' && <span aria-hidden="true">◇ </span>}
                {node.topic}
                {!node.page && <span className="dim"> …</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="trail-actions">
        <Button label="Write a retrospective" size="sm" isDisabled={!canRetro} onClick={onRetro} />
        <Button label="Clear" size="sm" variant="ghost" isDisabled={rows.length === 0} onClick={onClear} />
      </div>
    </Card>
  );
}
