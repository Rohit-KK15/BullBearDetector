'use client';

import type { RegimeTransition, RegimeLabel } from '@bull-bear/shared';

const labelConfig: Record<RegimeLabel, { color: string; bg: string; text: string }> = {
  bull: { color: 'bg-bull', bg: 'bg-bull/10', text: 'text-bull' },
  bear: { color: 'bg-bear', bg: 'bg-bear/10', text: 'text-bear' },
  neutral: { color: 'bg-neutral', bg: 'bg-neutral/10', text: 'text-neutral' },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function RegimeTimeline({ transitions }: { transitions: RegimeTransition[] }) {
  if (transitions.length === 0) {
    return (
      <div className="bg-surface-1 border border-subtle/20 rounded-2xl p-6">
        <h3 className="text-sm font-display font-semibold text-muted uppercase tracking-wider mb-5">Regime History</h3>
        <p className="text-sm text-muted/60 font-body text-center py-6">No regime changes recorded yet</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-1 border border-subtle/20 rounded-2xl p-6">
      <h3 className="text-sm font-display font-semibold text-muted uppercase tracking-wider mb-5">Regime History</h3>
      <div className="space-y-0">
        {transitions.map((t, i) => {
          const to = labelConfig[t.toLabel];
          const from = labelConfig[t.fromLabel];
          return (
            <div key={t.ts} className={`relative flex items-start gap-4 py-3 opacity-0 animate-fade-in stagger-${Math.min(i + 1, 6)}`}>
              {/* Timeline line */}
              {i < transitions.length - 1 && (
                <div className="absolute left-[11px] top-8 w-px h-[calc(100%-16px)] bg-subtle/20" />
              )}

              {/* Dot */}
              <div className={`mt-1 w-[22px] h-[22px] rounded-full flex-shrink-0 flex items-center justify-center ${to.bg} ring-1 ring-inset ${
                t.toLabel === 'bull' ? 'ring-bull/30' : t.toLabel === 'bear' ? 'ring-bear/30' : 'ring-neutral/30'
              }`}>
                <div className={`w-2 h-2 rounded-full ${to.color}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-mono font-semibold uppercase tracking-wider ${from.text}`}>
                    {t.fromLabel}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted/40 flex-shrink-0">
                    <path d="M2 6H10M10 6L7 3M10 6L7 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className={`text-xs font-mono font-semibold uppercase tracking-wider ${to.text}`}>
                    {t.toLabel}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-muted/50">
                  <span>{formatTime(t.ts)}</span>
                  <span className="text-muted/30">/</span>
                  <span>{timeAgo(t.ts)}</span>
                  <span className="text-muted/30">/</span>
                  <span>score {t.score >= 0 ? '+' : ''}{t.score.toFixed(3)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
