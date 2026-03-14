'use client';

import type { ConvictionFactors } from '@bull-bear/shared';

const gauges: { key: keyof ConvictionFactors; label: string; icon: string }[] = [
  { key: 'volConfidence', label: 'Vol Confidence', icon: '〰' },
  { key: 'volumeConfidence', label: 'Volume Confidence', icon: '▮' },
  { key: 'signalAgreement', label: 'Signal Agreement', icon: '⊕' },
];

function getBarColor(pct: number): string {
  if (pct >= 70) return 'bg-bull/70';
  if (pct >= 40) return 'bg-neutral/70';
  return 'bg-bear/70';
}

function getTextColor(pct: number): string {
  if (pct >= 70) return 'text-bull';
  if (pct >= 40) return 'text-neutral';
  return 'text-bear';
}

export function ConvictionGauges({ conviction }: { conviction: ConvictionFactors }) {
  return (
    <div className="bg-surface-1 border border-subtle/20 rounded-2xl p-6">
      <h3 className="text-sm font-display font-semibold text-muted uppercase tracking-wider mb-5">Conviction Factors</h3>
      <div className="space-y-5">
        {gauges.map(({ key, label, icon }, i) => {
          const value = conviction[key];
          const pct = value * 100;
          return (
            <div key={key} className={`opacity-0 animate-fade-in stagger-${i + 1}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-body text-white/70">
                  <span className="mr-1.5 opacity-40">{icon}</span>
                  {label}
                </span>
                <span className={`text-sm font-mono font-semibold tabular-nums ${getTextColor(pct)}`}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${getBarColor(pct)}`}
                  style={{ width: `${pct}%`, animationDelay: `${i * 0.1}s` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
