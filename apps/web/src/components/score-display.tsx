'use client';

import type { RegimeLabel } from '@bull-bear/shared';

const colorMap: Record<RegimeLabel, string> = {
  bull: 'text-bull',
  bear: 'text-bear',
  neutral: 'text-neutral',
};

export function ScoreDisplay({ score, label, size = 'lg' }: { score: number; label: RegimeLabel; size?: 'md' | 'lg' | 'xl' }) {
  const sizeClasses = {
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-5xl',
  };

  return (
    <span className={`font-mono font-bold tabular-nums ${colorMap[label]} ${sizeClasses[size]}`}>
      {score >= 0 ? '+' : ''}{score.toFixed(3)}
    </span>
  );
}
