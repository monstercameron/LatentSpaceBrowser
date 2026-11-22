import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Table } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { money } from '../state/spend.js';

const COLUMNS = [
  { key: 'pass', header: 'Pass' },
  { key: 'model', header: 'Model' },
  { key: 'first', header: 'First words' },
  { key: 'time', header: 'Time' },
  { key: 'speed', header: 'Speed' },
  { key: 'tokens', header: 'Tokens' },
  { key: 'cost', header: 'Cost' },
];

/** What a page cost: one row per model call, so the cost of curiosity is never hidden. */
export function Receipt({ metrics, linkError, format }) {
  if (!metrics) return null;
  const rows = metrics.passes.map((p) => ({
    pass: p.name,
    model: p.model,
    first: `${p.ttft.toFixed(2)}s`,
    time: `${p.seconds.toFixed(2)}s`,
    speed: `${Math.round(p.outTokens / Math.max(p.seconds, 0.001))} tok/s`,
    tokens: `${p.inTokens} in · ${p.outTokens} out`,
    cost: money(p.cost),
  }));
  const path = format === 'html' ? 'HTML' : 'A2UI';
  const summary = `${path} · Receipt · ${money(metrics.cost)} · ${
    metrics.passes.length > 1
      ? `text in ${metrics.ready.toFixed(2)}s · links after ${metrics.done.toFixed(2)}s`
      : `page in ${metrics.ready.toFixed(2)}s, links included`
  }`;

  return (
    <div className="receipt">
      <Collapsible trigger={<Text type="supporting">{summary}</Text>} defaultIsOpen={false}>
        <Table data={rows} columns={COLUMNS} />
        {linkError && (
          <Text type="supporting" color="secondary">
            The link pass failed, so this page has no links: {linkError}
          </Text>
        )}
      </Collapsible>
    </div>
  );
}
