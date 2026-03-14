'use client';

import { useRegimeScores } from '@/hooks/use-regime';
import { AssetCard } from '@/components/asset-card';
import { ConnectionStatus } from '@/components/connection-status';

export default function Home() {
  const { data: regimes, isLoading, isConnected } = useRegimeScores();

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">BullBearDetector</h1>
          <p className="text-gray-400 mt-1">Real-time crypto market regime detection</p>
        </div>
        <ConnectionStatus connected={isConnected ?? false} />
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(regimes ?? []).map(regime => (
            <AssetCard key={regime.asset} regime={regime} />
          ))}
        </div>
      )}
    </main>
  );
}
