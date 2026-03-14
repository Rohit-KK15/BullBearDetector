'use client';

import type { RegimeLabel } from '@bull-bear/shared';

const styles: Record<RegimeLabel, string> = {
  bull: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  neutral: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  bear: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function RegimeBadge({ label }: { label: RegimeLabel }) {
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${styles[label]}`}>
      {label.toUpperCase()}
    </span>
  );
}
