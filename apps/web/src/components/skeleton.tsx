'use client';

export function CardSkeleton() {
  return (
    <div className="bg-surface-1 border border-subtle/20 rounded-2xl p-6 animate-pulse">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-surface-3 rounded-lg" />
          <div className="w-16 h-5 bg-surface-3 rounded" />
        </div>
        <div className="w-16 h-6 bg-surface-3 rounded-md" />
      </div>
      <div className="w-32 h-10 bg-surface-3 rounded mb-5" />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="w-8 h-3 bg-surface-3 rounded mx-auto" />
            <div className="h-1 bg-surface-3 rounded-full" />
            <div className="w-8 h-3 bg-surface-3 rounded mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-20 h-10 bg-surface-3 rounded" />
        <div className="w-16 h-6 bg-surface-3 rounded-md" />
        <div className="w-32 h-10 bg-surface-3 rounded" />
      </div>
      <div className="h-80 bg-surface-1 border border-subtle/20 rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-60 bg-surface-1 border border-subtle/20 rounded-2xl" />
        <div className="h-60 bg-surface-1 border border-subtle/20 rounded-2xl" />
        <div className="h-60 bg-surface-1 border border-subtle/20 rounded-2xl" />
      </div>
    </div>
  );
}
