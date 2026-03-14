'use client';

import Link from 'next/link';
import type { RegimeScore } from '@bull-bear/shared';
import { RegimeBadge } from './regime-badge';

const scoreColor = (score: number) =>
  score > 0.3 ? 'text-emerald-400' : score < -0.3 ? 'text-red-400' : 'text-yellow-400';

export function AssetCard({ regime }: { regime: RegimeScore }) {
  return (
    <Link href={`/asset/${regime.asset}`}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{regime.asset}</h2>
          <RegimeBadge label={regime.label} />
        </div>
        <div className={`text-4xl font-mono font-bold mb-4 ${scoreColor(regime.score)}`}>
          {regime.score >= 0 ? '+' : ''}{regime.score.toFixed(3)}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
          <div>Momentum: <span className="text-gray-200">{regime.direction.momentum.toFixed(3)}</span></div>
          <div>Flow: <span className="text-gray-200">{regime.direction.flow.toFixed(3)}</span></div>
          <div>Depth: <span className="text-gray-200">{regime.direction.depth.toFixed(3)}</span></div>
          <div>Funding: <span className="text-gray-200">{regime.direction.funding.toFixed(3)}</span></div>
        </div>
      </div>
    </Link>
  );
}
