'use client';

import type { FeatureSnapshot } from '@bull-bear/shared';

interface Signal {
  key: keyof FeatureSnapshot;
  label: string;
  range: [number, number];
  format: (v: number) => string;
  category: 'directional' | 'conviction';
}

const signals: Signal[] = [
  { key: 'momentum', label: 'Momentum', range: [-1, 1], format: v => v.toFixed(4), category: 'directional' },
  { key: 'ofi', label: 'Order Flow Imbalance', range: [-1, 1], format: v => v.toFixed(4), category: 'directional' },
  { key: 'depthImb', label: 'Depth Imbalance', range: [-1, 1], format: v => v.toFixed(4), category: 'directional' },
  { key: 'fundingSentiment', label: 'Funding Sentiment', range: [-1, 1], format: v => v.toFixed(4), category: 'directional' },
  { key: 'volatilityPercentile', label: 'Volatility Percentile', range: [0, 1], format: v => `${(v * 100).toFixed(0)}%`, category: 'conviction' },
  { key: 'volumeRatio', label: 'Volume Ratio', range: [0, 3], format: v => `${v.toFixed(2)}x`, category: 'conviction' },
];

function SignalRow({ signal, value, index }: { signal: Signal; value: number; index: number }) {
  const [min, max] = signal.range;
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const isDirectional = signal.category === 'directional';
  const isPositive = value >= 0;

  return (
    <div className={`opacity-0 animate-fade-in stagger-${index + 1}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-body text-white/60">{signal.label}</span>
        <span className={`text-xs font-mono font-medium tabular-nums ${
          isDirectional
            ? (isPositive ? 'text-bull/90' : 'text-bear/90')
            : (normalized > 0.6 ? 'text-bull/90' : normalized > 0.3 ? 'text-neutral/90' : 'text-bear/90')
        }`}>
          {signal.format(value)}
        </span>
      </div>
      <div className="h-1 bg-surface-3 rounded-full overflow-hidden relative">
        {isDirectional ? (
          <>
            <div className="absolute left-1/2 top-0 w-px h-full bg-subtle/50 z-10" />
            <div
              className={`absolute top-0 h-full rounded-full transition-all duration-500 ${
                isPositive ? 'bg-bull/50 left-1/2' : 'bg-bear/50'
              }`}
              style={{
                width: `${Math.abs(normalized - 0.5) * 100}%`,
                ...(isPositive ? {} : { left: `${normalized * 100}%` }),
              }}
            />
          </>
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              normalized > 0.6 ? 'bg-bull/50' : normalized > 0.3 ? 'bg-neutral/50' : 'bg-bear/50'
            }`}
            style={{ width: `${normalized * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function FeatureSignals({ features }: { features: FeatureSnapshot }) {
  const directional = signals.filter(s => s.category === 'directional');
  const conviction = signals.filter(s => s.category === 'conviction');

  return (
    <div className="bg-surface-1 border border-subtle/20 rounded-2xl p-6">
      <h3 className="text-sm font-display font-semibold text-muted uppercase tracking-wider mb-5">Raw Signals</h3>

      <div className="mb-5">
        <div className="text-[10px] font-mono text-muted/60 uppercase tracking-widest mb-3">Directional</div>
        <div className="space-y-3">
          {directional.map((s, i) => (
            <SignalRow key={s.key} signal={s} value={features[s.key] as number} index={i} />
          ))}
        </div>
      </div>

      <div className="border-t border-subtle/10 pt-4">
        <div className="text-[10px] font-mono text-muted/60 uppercase tracking-widest mb-3">Conviction Inputs</div>
        <div className="space-y-3">
          {conviction.map((s, i) => (
            <SignalRow key={s.key} signal={s} value={features[s.key] as number} index={i + 4} />
          ))}
        </div>
      </div>
    </div>
  );
}
