'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import type { Asset, Interval } from '@bull-bear/shared';
import { VALID_INTERVALS } from '@bull-bear/shared';
import { useAssetRegime, useHistory } from '@/hooks/use-regime';
import { RegimeBadge } from '@/components/regime-badge';
import { RegimeChart } from '@/components/regime-chart';
import { DirectionBreakdown } from '@/components/direction-breakdown';
import { ConvictionGauges } from '@/components/conviction-gauges';

const scoreColor = (score: number) =>
  score > 0.3 ? 'text-emerald-400' : score < -0.3 ? 'text-red-400' : 'text-yellow-400';

export default function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const asset = id.toUpperCase() as Asset;
  const [interval, setInterval] = useState<Interval>('1m');

  const { data: regime, isLoading } = useAssetRegime(asset);
  const { data: history } = useHistory(asset, interval);

  if (isLoading) {
    return <div className="min-h-screen p-8 text-gray-400">Loading {asset}...</div>;
  }

  if (!regime) {
    return <div className="min-h-screen p-8 text-gray-400">No data for {asset}</div>;
  }

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <Link href="/" className="text-gray-400 hover:text-gray-200 text-sm mb-4 inline-block">
        &larr; Back to overview
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold">{asset}</h1>
        <RegimeBadge label={regime.label} />
        <span className={`text-4xl font-mono font-bold ${scoreColor(regime.score)}`}>
          {regime.score >= 0 ? '+' : ''}{regime.score.toFixed(3)}
        </span>
      </div>

      {/* Interval selector */}
      <div className="flex gap-2 mb-4">
        {VALID_INTERVALS.map(i => (
          <button
            key={i}
            onClick={() => setInterval(i)}
            className={`px-3 py-1 rounded text-sm ${interval === i ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}
          >
            {i}
          </button>
        ))}
      </div>

      {/* Regime chart */}
      {history && <RegimeChart data={history.data} color={regime.score > 0 ? '#22c55e' : '#ef4444'} />}

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <DirectionBreakdown direction={regime.direction} />
        <ConvictionGauges conviction={regime.conviction} />
      </div>
    </main>
  );
}
