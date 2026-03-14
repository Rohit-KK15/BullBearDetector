'use client';

import type { DirectionComponents } from '@bull-bear/shared';
import { DIRECTION_WEIGHTS } from '@bull-bear/shared';

const labels: Record<keyof DirectionComponents, { name: string; weight: number }> = {
  momentum: { name: 'Momentum', weight: DIRECTION_WEIGHTS.momentum },
  flow: { name: 'Order Flow', weight: DIRECTION_WEIGHTS.orderFlow },
  depth: { name: 'Book Depth', weight: DIRECTION_WEIGHTS.depth },
  funding: { name: 'Funding', weight: DIRECTION_WEIGHTS.funding },
};

export function DirectionBreakdown({ direction }: { direction: DirectionComponents }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">Direction Breakdown</h3>
      <div className="space-y-3">
        {(Object.entries(labels) as [keyof DirectionComponents, (typeof labels)[keyof DirectionComponents]][]).map(([key, { name, weight }]) => {
          const value = direction[key];
          const pct = Math.abs(value) * 100;
          const isPositive = value >= 0;
          return (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">{name} <span className="text-gray-600">({(weight * 100).toFixed(0)}%)</span></span>
                <span className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
                  {value >= 0 ? '+' : ''}{value.toFixed(4)}
                </span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(pct * 3, 100)}%`, marginLeft: isPositive ? '50%' : `${50 - Math.min(pct * 3, 50)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
