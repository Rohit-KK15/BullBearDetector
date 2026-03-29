'use client';

import { useRegimeScores } from '@/hooks/use-regime';
import { AssetCard } from '@/components/asset-card';
import { ConnectionStatus } from '@/components/connection-status';
import { CardSkeleton } from '@/components/skeleton';
import { ErrorState } from '@/components/error-state';

export default function Home() {
  const { data: regimes, isLoading, isError, isConnected } = useRegimeScores();

  return (
    <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-10 opacity-0 animate-fade-in">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-bull/20 to-bear/20 flex items-center justify-center border border-subtle/20">
              <span className="text-sm font-mono font-bold text-white/60">BB</span>
            </div>
            <h1 className="text-2xl font-display font-bold text-white tracking-tight">BullBearDetector</h1>
          </div>
          <p className="text-sm text-muted font-body pl-11">Real-time crypto market regime detection</p>
        </div>
        <ConnectionStatus connected={isConnected ?? false} />
      </div>

      {/* Asset grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : isError ? (
        <ErrorState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(regimes ?? []).map((regime, i) => (
            <AssetCard key={regime.asset} regime={regime} index={i} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-16 text-center opacity-0 animate-fade-in stagger-6">
        <p className="text-[11px] font-mono text-muted/40 tracking-wider">
          Signals from Binance / Bybit / OKX — 5s tick — Regime scoring via weighted direction x conviction
        </p>
      </div>
    </main>
  );
}
