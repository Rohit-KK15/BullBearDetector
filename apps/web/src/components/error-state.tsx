'use client';

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center py-16 opacity-0 animate-fade-in">
      <div className="w-12 h-12 rounded-xl bg-bear/10 border border-bear/20 flex items-center justify-center mb-4">
        <span className="text-bear text-lg font-mono">!</span>
      </div>
      <p className="text-sm text-bear/80 font-mono mb-1">Connection error</p>
      <p className="text-xs text-muted font-body">{message ?? 'Could not reach backend. Retrying automatically...'}</p>
    </div>
  );
}
