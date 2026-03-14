'use client';

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
      <span className="text-gray-400">{connected ? 'Live' : 'Disconnected'}</span>
    </div>
  );
}
