import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Table } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { useT } from '../i18n/index.js';
import { money } from '../state/spend.js';

/** What a page cost: one row per model call, so the cost of curiosity is never hidden. */
export function Receipt({ metrics, linkError, format }) {
  const t = useT();
  if (!metrics) return null;
  const columns = [
    { key: 'pass', header: t('receipt.pass') },
    { key: 'model', header: t('receipt.model') },
    { key: 'first', header: t('receipt.first') },
    { key: 'time', header: t('receipt.time') },
    { key: 'speed', header: t('receipt.speed') },
    { key: 'tokens', header: t('receipt.tokens') },
    { key: 'cost', header: t('receipt.cost') },
  ];
  const rows = metrics.passes.map((p) => ({
    pass: t(`pass.${p.id}`),
    model: p.model,
    first: `${p.ttft.toFixed(2)}s`,
    time: `${p.seconds.toFixed(2)}s`,
    speed: t('receipt.tokensPerSecond', { n: Math.round(p.outTokens / Math.max(p.seconds, 0.001)) }),
    tokens: t('receipt.inOut', { in: p.inTokens, out: p.outTokens }),
    cost: money(p.cost),
  }));
  const path = format === 'html' ? 'HTML' : 'A2UI';
  // The first pass is when the text was on screen; the rest (links, accessibility) arrive after it.
  const summary = `${path} · ${t('receipt.title')} · ${money(metrics.cost)} · ${
    metrics.passes.length > 1
      ? `${t('receipt.text', { s: metrics.ready.toFixed(2) })} · ${t('receipt.links', { s: metrics.done.toFixed(2) })}`
      : t('receipt.whole', { s: metrics.ready.toFixed(2) })
  }`;

  return (
    <div className="receipt">
      <Collapsible trigger={<Text type="supporting">{summary}</Text>} defaultIsOpen={false}>
        <Table data={rows} columns={columns} />
        {linkError && (
          <Text type="supporting" color="secondary">
            {t('receipt.linkFailed', { message: linkError })}
          </Text>
        )}
      </Collapsible>
    </div>
  );
}
