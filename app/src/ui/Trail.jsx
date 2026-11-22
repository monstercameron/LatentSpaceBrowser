import { useEffect, useMemo, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { useT } from '../i18n/index.js';
import { visibleRows } from '../state/journey.js';

const KEY = 'latentspace_trail_collapsed';
const load = () => {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(KEY)) ?? []);
  } catch {
    return new Set();
  }
};

/** The journeys as a tree. Go back and follow a different link and the path forks. Branches fold, and any of them can be deleted. */
export function Trail({ rows, currentId, canRetro, onJump, onRetro, onClear, onRemove }) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(load);
  const save = (next) => {
    setCollapsed(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // no storage: folding lasts for the page only
    }
  };
  const toggle = (id) => {
    const next = new Set(collapsed);
    if (!next.delete(id)) next.add(id);
    save(next);
  };

  // Reaching a page (a link, Back, a shared address) unfolds the branches above it, so the reader can see where they are.
  useEffect(() => {
    const at = rows.findIndex((r) => r.node.id === currentId);
    if (at < 0) return;
    const hidden = [];
    let depth = rows[at].depth;
    for (let i = at - 1; i >= 0 && depth > 0; i--) {
      if (rows[i].depth < depth) {
        depth = rows[i].depth;
        if (collapsed.has(rows[i].node.id)) hidden.push(rows[i].node.id);
      }
    }
    if (hidden.length) save(new Set([...collapsed].filter((id) => !hidden.includes(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the reader arrives somewhere
  }, [currentId]);

  const shown = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed]);
  const parents = useMemo(() => visibleRows(rows, new Set()).filter((r) => r.below > 0).map((r) => r.node.id), [rows]);
  const allFolded = parents.length > 0 && parents.every((id) => collapsed.has(id));

  return (
    <Card padding={3}>
      <Heading level={3}>{t('trail.title')}</Heading>
      {rows.length === 0 ? (
        <Text type="supporting" color="secondary" display="block">
          {t('trail.empty')}
        </Text>
      ) : (
        <ul className="trail" aria-label={t('trail.list')}>
          {shown.map(({ node, depth, siblings, below, folded }) => (
            <li key={node.id} className="trail-item" style={{ paddingInlineStart: depth * 14 }}>
              {below > 0 ? (
                <button
                  type="button"
                  className="trail-tool trail-fold"
                  aria-expanded={!folded}
                  aria-label={folded ? t('trail.expand') : t('trail.collapse')}
                  title={folded ? t('trail.expand') : t('trail.collapse')}
                  onClick={() => toggle(node.id)}
                >
                  <span aria-hidden="true">{folded ? '▸' : '▾'}</span>
                </button>
              ) : (
                <span className="trail-fold" aria-hidden="true" />
              )}
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
                {folded && <span className="dim"> · {t('trail.hidden', { n: below })}</span>}
              </button>
              <button
                type="button"
                className="trail-tool trail-delete"
                aria-label={`${depth === 0 ? t('trail.deleteTrail') : t('trail.removeBranch')}: ${node.topic}`}
                title={depth === 0 ? t('trail.deleteTrail') : t('trail.removeBranch')}
                onClick={() => onRemove(node.id)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="trail-actions">
        <Button label={t('trail.retro')} size="sm" isDisabled={!canRetro} onClick={onRetro} />
        <Button
          label={allFolded ? t('trail.expandAll') : t('trail.collapseAll')}
          size="sm"
          variant="ghost"
          isDisabled={parents.length === 0}
          onClick={() => save(allFolded ? new Set() : new Set(parents))}
        />
        <Button label={t('trail.clear')} size="sm" variant="ghost" isDisabled={rows.length === 0} onClick={onClear} />
      </div>
    </Card>
  );
}
