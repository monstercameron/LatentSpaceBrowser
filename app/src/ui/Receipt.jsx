import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Table } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { useT } from '../i18n/index.js';
import { money } from '../state/spend.js';

// Cache amounts are often a hundredth of a cent, so they get a digit more than the page total does.
const small = (usd) => `$${usd.toFixed(usd < 0.001 ? 5 : 4)}`;

// What the provider's prompt cache did on one call: tokens read from it (cheaper), tokens written to it (dearer).
function cacheCell(p, t) {
  const cached = p.cached ?? 0;
  const written = p.written ?? 0;
  if (!cached && !written) return t('receipt.cacheNone');
  const parts = [];
  if (cached) parts.push(t('receipt.cacheHit', { n: cached.toLocaleString() }));
  if (written) parts.push(t('receipt.cacheWrite', { n: written.toLocaleString() }));
  const effect = p.cacheEffect ?? 0;
  if (Math.abs(effect) >= 0.000005) parts.push(effect > 0 ? t('receipt.cacheSaved', { amount: small(effect) }) : t('receipt.cacheCost', { amount: small(-effect) }));
  return parts.join(' · ');
}

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
    { key: 'cache', header: t('receipt.cache') },
    { key: 'cost', header: t('receipt.cost') },
  ];
  const rows = metrics.passes.map((p) => ({
    pass: t(`pass.${p.id}`),
    model: p.model,
    first: `${p.ttft.toFixed(2)}s`,
    time: `${p.seconds.toFixed(2)}s`,
    speed: t('receipt.tokensPerSecond', { n: Math.round(p.outTokens / Math.max(p.seconds, 0.001)) }),
    tokens: t('receipt.inOut', { in: p.inTokens, out: p.outTokens }),
    cache: cacheCell(p, t),
    cost: money(p.cost),
  }));
  const path = format === 'html' ? 'HTML' : 'A2UI';
  // What the provider's cache saved on the whole page, if it did anything.
  const effect = metrics.cacheEffect ?? 0;
  const cacheNote = Math.abs(effect) >= 0.000005 ? ` · ${effect > 0 ? t('receipt.cacheSaved', { amount: small(effect) }) : t('receipt.cacheCost', { amount: small(-effect) })}` : '';
  // The first pass is when the text was on screen; the rest (links, accessibility) arrive after it.
  const summary = `${path} · ${t('receipt.title')} · ${money(metrics.cost)}${cacheNote} · ${
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
