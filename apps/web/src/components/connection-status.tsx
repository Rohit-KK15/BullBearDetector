'use client';

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div
      role="status"
      aria-label={connected ? 'Live connection' : 'Disconnected'}
      className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-surface-2 border border-subtle/30"
    >
      <div className="relative">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-bull' : 'bg-bear'}`} />
        {connected && (
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-bull animate-pulse-glow" />
        )}
      </div>
      <span className="text-xs font-mono font-medium tracking-wider uppercase text-muted">
        {connected ? 'Live' : 'Offline'}
      </span>
    </div>
  );
}
