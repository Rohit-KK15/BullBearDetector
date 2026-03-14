'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import type { Asset, Interval } from '@bull-bear/shared';
import { VALID_INTERVALS } from '@bull-bear/shared';
import { useAssetRegime, useHistory, useTransitions } from '@/hooks/use-regime';
import { RegimeBadge } from '@/components/regime-badge';
import { RegimeChart } from '@/components/regime-chart';
import { DirectionBreakdown } from '@/components/direction-breakdown';
import { ConvictionGauges } from '@/components/conviction-gauges';
import { FeatureSignals } from '@/components/feature-signals';
import { ScoreDisplay } from '@/components/score-display';
import { ConnectionStatus } from '@/components/connection-status';
import { RegimeTimeline } from '@/components/regime-timeline';
import { DetailSkeleton } from '@/components/skeleton';

const icons: Record<string, string> = {
  BTC: '₿',
  ETH: 'Ξ',
  SOL: '◎',
};

function formatPrice(price: number): string {
  if (price === 0) return '—';
  if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

export default function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const asset = id.toUpperCase() as Asset;
  const [interval, setInterval] = useState<Interval>('1m');

  const { data: regime, isLoading, isConnected } = useAssetRegime(asset);
  const { data: history } = useHistory(asset, interval);
  const { data: transitions } = useTransitions(asset);

  return (
    <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      {/* Top nav */}
      <div className="flex items-center justify-between mb-8 opacity-0 animate-fade-in">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-muted hover:text-white/80 transition-colors font-body group"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Overview
        </Link>
        <ConnectionStatus connected={isConnected ?? false} />
      </div>

      {isLoading ? (
        <DetailSkeleton />
      ) : !regime ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-0 animate-fade-in">
          <div className="text-4xl mb-4 opacity-30">?</div>
          <p className="text-muted font-body">No data available for {asset}</p>
        </div>
      ) : (
        <>
          {/* Asset header */}
          <div className="flex items-center gap-4 mb-3 opacity-0 animate-slide-up">
            <span className="text-4xl opacity-30 font-mono">{icons[asset] ?? '#'}</span>
            <div>
              <h1 className="text-3xl font-display font-bold text-white tracking-tight">{asset}</h1>
              <span className="text-lg font-mono text-white/50 tabular-nums">{formatPrice(regime.price)}</span>
            </div>
            <RegimeBadge label={regime.label} size="lg" />
            <div className="ml-auto">
              <ScoreDisplay score={regime.score} label={regime.label} size="xl" />
            </div>
          </div>

          {/* Composite scores bar */}
          <div className="flex items-center gap-6 mb-8 opacity-0 animate-fade-in stagger-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted uppercase tracking-wider">Direction</span>
              <span className={`text-sm font-mono font-semibold tabular-nums ${
                regime.direction.momentum + regime.direction.flow + regime.direction.depth + regime.direction.funding >= 0
                  ? 'text-bull/80' : 'text-bear/80'
              }`}>
                {(regime.direction.momentum + regime.direction.flow + regime.direction.depth + regime.direction.funding) >= 0 ? '+' : ''}
                {(regime.direction.momentum + regime.direction.flow + regime.direction.depth + regime.direction.funding).toFixed(3)}
              </span>
            </div>
            <div className="w-px h-4 bg-subtle/30" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted uppercase tracking-wider">Conviction</span>
              <span className="text-sm font-mono font-semibold tabular-nums text-white/70">
                {((regime.conviction.volConfidence + regime.conviction.volumeConfidence + regime.conviction.signalAgreement) / 3 * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-px h-4 bg-subtle/30" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted uppercase tracking-wider">Updated</span>
              <span className="text-sm font-mono text-white/50">
                {new Date(regime.ts).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Interval selector + chart */}
          <div className="opacity-0 animate-fade-in stagger-2">
            <div className="flex items-center gap-1.5 mb-4">
              {VALID_INTERVALS.map(i => (
                <button
                  key={i}
                  onClick={() => setInterval(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-200 ${
                    interval === i
                      ? 'bg-surface-3 text-white border border-subtle/30'
                      : 'text-muted hover:text-white/70 hover:bg-surface-2'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
            {history && <RegimeChart data={history.data} label={regime.label} />}
          </div>

          {/* Breakdowns - 3 column */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <DirectionBreakdown direction={regime.direction} />
            <ConvictionGauges conviction={regime.conviction} />
            {regime.features && <FeatureSignals features={regime.features} />}
          </div>

          {/* Regime transition history */}
          <div className="mt-6 opacity-0 animate-fade-in stagger-4">
            <RegimeTimeline transitions={transitions ?? []} />
          </div>
        </>
      )}
    </main>
  );
}
