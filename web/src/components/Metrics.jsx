const money = (usd) => `$${usd.toFixed(usd < 0.01 ? 4 : 2)}`;

export function Metrics({ metrics, spent }) {
  const stats = metrics && [
    ['First token', `${metrics.ttft.toFixed(2)}s`],
    ['Speed', `${Math.round(metrics.tps)} tok/s`],
    ['Time', `${metrics.seconds.toFixed(2)}s`],
    ['Tokens', `${metrics.inTokens} in · ${metrics.outTokens} out`],
    ['Cost', money(metrics.cost)],
    ...(metrics.passes > 1 ? [['Passes', metrics.passes]] : []),
  ];

  return (
    <dl className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 font-mono text-[0.8125rem] text-muted">
      {stats?.map(([label, value]) => (
        <div key={label} className="flex gap-1.5">
          <dt>{label}</dt>
          <dd className="text-ink">{value}</dd>
        </div>
      ))}
      {spent > 0 && (
        <div className="flex gap-1.5">
          <dt>Session</dt>
          <dd className="text-ink">{money(spent)}</dd>
        </div>
      )}
    </dl>
  );
}
