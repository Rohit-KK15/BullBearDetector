'use client';

import type { RegimeLabel } from '@bull-bear/shared';

const config: Record<RegimeLabel, { bg: string; text: string; border: string; glow: string }> = {
  bull: {
    bg: 'bg-bull/10',
    text: 'text-bull',
    border: 'border-bull/20',
    glow: 'shadow-[0_0_12px_-2px_rgba(0,232,123,0.3)]',
  },
  neutral: {
    bg: 'bg-neutral/10',
    text: 'text-neutral',
    border: 'border-neutral/20',
    glow: 'shadow-[0_0_12px_-2px_rgba(255,178,36,0.3)]',
  },
  bear: {
    bg: 'bg-bear/10',
    text: 'text-bear',
    border: 'border-bear/20',
    glow: 'shadow-[0_0_12px_-2px_rgba(255,59,92,0.3)]',
  },
};

export function RegimeBadge({ label, size = 'md' }: { label: RegimeLabel; size?: 'sm' | 'md' | 'lg' }) {
  const s = config[label];
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
    lg: 'px-4 py-1.5 text-sm',
  };

  return (
    <span className={`
      inline-flex items-center rounded-md font-mono font-semibold tracking-widest uppercase
      border ${s.bg} ${s.text} ${s.border} ${s.glow} ${sizeClasses[size]}
    `}>
      {label}
    </span>
  );
}
