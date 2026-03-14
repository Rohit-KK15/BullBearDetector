'use client';

import type { DirectionComponents } from '@bull-bear/shared';

const signals: { key: keyof DirectionComponents; label: string }[] = [
  { key: 'momentum', label: 'MOM' },
  { key: 'flow', label: 'FLOW' },
  { key: 'depth', label: 'DEPTH' },
  { key: 'funding', label: 'FUND' },
];

export function MiniDirectionBars({ direction }: { direction: DirectionComponents }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {signals.map(({ key, label }) => {
        const value = direction[key];
        const isPositive = value >= 0;
        const pct = Math.min(Math.abs(value) * 200, 100);
        return (
          <div key={key} className="text-center">
            <div className="text-[10px] font-mono text-muted mb-1.5 tracking-wider">{label}</div>
            <div className="h-1 bg-surface-3 rounded-full overflow-hidden relative">
              <div
                className={`absolute top-0 h-full rounded-full transition-all duration-500 ${
                  isPositive ? 'bg-bull/70 right-1/2' : 'bg-bear/70 left-1/2'
                }`}
                style={{ width: `${pct / 2}%` }}
              />
              {/* Center tick */}
              <div className="absolute left-1/2 top-0 w-px h-full bg-subtle/60" />
            </div>
            <div className={`text-[10px] font-mono mt-1 tabular-nums ${isPositive ? 'text-bull/80' : 'text-bear/80'}`}>
              {value >= 0 ? '+' : ''}{value.toFixed(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
