'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Asset, RegimeScore, RegimeWithFeatures, WsRegimeUpdate, Interval } from '@bull-bear/shared';
import { ASSETS } from '@bull-bear/shared';
import { fetchAllRegimes, fetchRegime, fetchHistory, fetchTransitions, fetchPriceHistory } from '../lib/api';
import { useRegimeWebSocket } from './use-websocket';

// Query a large window per interval so the chart is always full
const INTERVAL_LOOKBACK: Record<Interval, number> = {
  '5s':  60 * 60_000,          // 1 hr
  '1m':  24 * 3600_000,        // 24 hrs
  '5m':  3 * 86400_000,        // 3 days
  '15m': 7 * 86400_000,        // 7 days
  '1h':  30 * 86400_000,       // 30 days
  '1d':  90 * 86400_000,       // 90 days
};

export function useRegimeScores() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['regimes'],
    queryFn: fetchAllRegimes,
    refetchInterval: 10_000,
  });

  const handleUpdate = useCallback((update: WsRegimeUpdate) => {
    queryClient.setQueryData<RegimeScore[]>(['regimes'], (old) => {
      if (!old) return old;
      return old.map(r =>
        r.asset === update.asset
          ? { ...r, score: update.score, label: update.label, price: update.price, direction: update.direction, conviction: update.conviction, ts: update.ts }
          : r
      );
    });
  }, [queryClient]);

  const { isConnected } = useRegimeWebSocket(ASSETS, handleUpdate);

  return { ...query, isConnected };
}

export function useAssetRegime(asset: Asset) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['regime', asset],
    queryFn: () => fetchRegime(asset),
    refetchInterval: 10_000,
  });

  const handleUpdate = useCallback((update: WsRegimeUpdate) => {
    if (update.asset !== asset) return;
    queryClient.setQueryData<RegimeWithFeatures>(['regime', asset], (old) => {
      if (!old) return old;
      return {
        ...old,
        score: update.score,
        label: update.label,
        price: update.price,
        direction: update.direction,
        conviction: update.conviction,
        ts: update.ts,
      };
    });
  }, [queryClient, asset]);

  const { isConnected } = useRegimeWebSocket([asset], handleUpdate);

  return { ...query, isConnected };
}

export function useHistory(asset: Asset, interval: Interval) {
  const from = Date.now() - INTERVAL_LOOKBACK[interval];
  return useQuery({
    queryKey: ['history', asset, interval],
    queryFn: () => fetchHistory(asset, interval, from, Date.now()),
    refetchInterval: 30_000,
  });
}

export function usePriceHistory(asset: Asset, interval: Interval) {
  const from = Date.now() - INTERVAL_LOOKBACK[interval];
  return useQuery({
    queryKey: ['priceHistory', asset, interval],
    queryFn: () => fetchPriceHistory(asset, interval, from, Date.now()),
    refetchInterval: 30_000,
  });
}

export function useTransitions(asset: Asset, hours: number = 24) {
  return useQuery({
    queryKey: ['transitions', asset, hours],
    queryFn: () => fetchTransitions(asset, hours),
    refetchInterval: 60_000,
  });
}
