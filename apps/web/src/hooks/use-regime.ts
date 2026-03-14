'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Asset, RegimeScore, WsRegimeUpdate, Interval } from '@bull-bear/shared';
import { ASSETS } from '@bull-bear/shared';
import { fetchAllRegimes, fetchRegime, fetchHistory } from '../lib/api';
import { useRegimeWebSocket } from './use-websocket';

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
          ? { ...r, score: update.score, label: update.label, direction: update.direction, conviction: update.conviction, ts: update.ts }
          : r
      );
    });
  }, [queryClient]);

  const ws = useRegimeWebSocket(ASSETS, handleUpdate);

  return { ...query, isConnected: ws.isConnected };
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
    queryClient.invalidateQueries({ queryKey: ['regime', asset] });
  }, [queryClient, asset]);

  useRegimeWebSocket([asset], handleUpdate);

  return query;
}

export function useHistory(asset: Asset, interval: Interval) {
  return useQuery({
    queryKey: ['history', asset, interval],
    queryFn: () => fetchHistory(asset, interval),
    refetchInterval: 30_000,
  });
}
