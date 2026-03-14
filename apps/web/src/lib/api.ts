import type { Asset, RegimeScore, RegimeWithFeatures, FeatureSnapshot, HistoryResponse, Interval } from '@bull-bear/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function fetchAllRegimes(): Promise<RegimeScore[]> {
  const res = await fetch(`${API_URL}/api/regime`);
  const json = await res.json();
  return json.data;
}

export async function fetchRegime(asset: Asset): Promise<RegimeWithFeatures> {
  const res = await fetch(`${API_URL}/api/regime/${asset}`);
  const json = await res.json();
  return json.data;
}

export async function fetchFeatures(asset: Asset): Promise<FeatureSnapshot> {
  const res = await fetch(`${API_URL}/api/features/${asset}`);
  const json = await res.json();
  return json.data;
}

export async function fetchHistory(asset: Asset, interval: Interval = '1m', from?: number, to?: number): Promise<HistoryResponse> {
  const params = new URLSearchParams({ interval });
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  const res = await fetch(`${API_URL}/api/history/${asset}?${params}`);
  const json = await res.json();
  return json.data;
}
