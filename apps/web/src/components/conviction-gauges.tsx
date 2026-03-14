'use client';

import type { ConvictionFactors } from '@bull-bear/shared';

const gaugeLabels: Record<keyof ConvictionFactors, string> = {
  volConfidence: 'Vol Confidence',
  volumeConfidence: 'Volume Confidence',
  signalAgreement: 'Signal Agreement',
};

function Gauge({ label, value }: { label: string; value: number }) {
  const pct = value * 100;
  const color = pct > 70 ? 'bg-emerald-500' : pct > 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-200">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ConvictionGauges({ conviction }: { conviction: ConvictionFactors }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">Conviction Factors</h3>
      <div className="space-y-4">
        {(Object.entries(gaugeLabels) as [keyof ConvictionFactors, string][]).map(([key, label]) => (
          <Gauge key={key} label={label} value={conviction[key]} />
        ))}
      </div>
    </div>
  );
}
