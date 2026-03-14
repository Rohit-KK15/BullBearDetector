'use client';

import { useEffect, useRef } from 'react';
import { createChart, type IChartApi } from 'lightweight-charts';

interface SignalChartProps {
  title: string;
  data: Array<{ time: number; value: number }>;
  color?: string;
  height?: number;
}

export function SignalChart({ title, data, color = '#3b82f6', height = 200 }: SignalChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: { background: { color: 'transparent' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151', timeVisible: true },
    });

    const series = chart.addLineSeries({ color, lineWidth: 2 });

    if (data.length > 0) {
      series.setData(data.map(d => ({ time: d.time as unknown as import('lightweight-charts').Time, value: d.value })));
    }

    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, color, height]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-2">{title}</h3>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
