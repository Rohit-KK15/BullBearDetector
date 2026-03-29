import type { Asset, RegimeScore, RegimeWithFeatures, HistoryResponse, PriceHistoryResponse, Interval, RegimeTransition } from '@bull-bear/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  const json = await res.json();
  return json.data;
}

export async function fetchAllRegimes(): Promise<RegimeScore[]> {
  return apiFetch('/api/regime');
}

export async function fetchRegime(asset: Asset): Promise<RegimeWithFeatures> {
  return apiFetch(`/api/regime/${asset}`);
}

export async function fetchHistory(asset: Asset, interval: Interval = '1m', from?: number, to?: number): Promise<HistoryResponse> {
  const params = new URLSearchParams({ interval });
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  return apiFetch(`/api/history/${asset}?${params}`);
}

export async function fetchPriceHistory(asset: Asset, interval: Interval = '1m', from?: number, to?: number): Promise<PriceHistoryResponse> {
  const params = new URLSearchParams({ interval });
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  return apiFetch(`/api/prices/${asset}?${params}`);
}

export async function fetchTransitions(asset: Asset, hours: number = 24): Promise<RegimeTransition[]> {
  return apiFetch(`/api/transitions/${asset}?hours=${hours}`);
}
