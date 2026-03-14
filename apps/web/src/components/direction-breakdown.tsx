'use client';

import type { DirectionComponents } from '@bull-bear/shared';
import { DIRECTION_WEIGHTS } from '@bull-bear/shared';

const signals: { key: keyof DirectionComponents; label: string; weightKey: keyof typeof DIRECTION_WEIGHTS }[] = [
  { key: 'momentum', label: 'Momentum', weightKey: 'momentum' },
  { key: 'flow', label: 'Order Flow', weightKey: 'orderFlow' },
  { key: 'depth', label: 'Book Depth', weightKey: 'depth' },
  { key: 'funding', label: 'Funding Rate', weightKey: 'funding' },
];

export function DirectionBreakdown({ direction }: { direction: DirectionComponents }) {
  return (
    <div className="bg-surface-1 border border-subtle/20 rounded-2xl p-6">
      <h3 className="text-sm font-display font-semibold text-muted uppercase tracking-wider mb-5">Direction Breakdown</h3>
      <div className="space-y-4">
        {signals.map(({ key, label, weightKey }, i) => {
          const value = direction[key];
          const weight = DIRECTION_WEIGHTS[weightKey];
          const isPositive = value >= 0;
          const barPct = Math.min(Math.abs(value) * 150, 50);
          return (
            <div key={key} className={`opacity-0 animate-fade-in stagger-${i + 1}`}>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-body text-white/70">{label}
                  <span className="ml-1.5 text-xs text-muted font-mono">{(weight * 100).toFixed(0)}%</span>
                </span>
                <span className={`font-mono font-medium tabular-nums text-sm ${isPositive ? 'text-bull' : 'text-bear'}`}>
                  {value >= 0 ? '+' : ''}{value.toFixed(4)}
                </span>
              </div>
              <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden relative">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 w-px h-full bg-subtle/50 z-10" />
                {/* Value bar */}
                <div
                  className={`absolute top-0 h-full rounded-full animate-bar-fill origin-left ${
                    isPositive ? 'bg-bull/60 left-1/2' : 'bg-bear/60 right-1/2'
                  }`}
                  style={{
                    width: `${barPct}%`,
                    animationDelay: `${i * 0.1}s`,
                    ...(isPositive ? {} : { left: `${50 - barPct}%`, right: 'auto' }),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
