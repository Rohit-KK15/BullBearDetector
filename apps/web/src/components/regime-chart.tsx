'use client';

import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type LineData, type Time } from 'lightweight-charts';
import type { HistoryPoint } from '@bull-bear/shared';

interface RegimeChartProps {
  data: HistoryPoint[];
  label: 'bull' | 'neutral' | 'bear';
  height?: number;
}

const lineColors = {
  bull: '#00e87b',
  bear: '#ff3b5c',
  neutral: '#ffb224',
};

const areaTopColors = {
  bull: 'rgba(0, 232, 123, 0.15)',
  bear: 'rgba(255, 59, 92, 0.15)',
  neutral: 'rgba(255, 178, 36, 0.15)',
};

export function RegimeChart({ data, label, height = 320 }: RegimeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: '#5a6578',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(58, 68, 85, 0.15)' },
        horzLines: { color: 'rgba(58, 68, 85, 0.15)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(58, 68, 85, 0.3)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(58, 68, 85, 0.3)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(90, 101, 120, 0.3)', width: 1, style: 3 },
        horzLine: { color: 'rgba(90, 101, 120, 0.3)', width: 1, style: 3 },
      },
    });

    const series = chart.addAreaSeries({
      lineColor: lineColors[label],
      lineWidth: 2,
      topColor: areaTopColors[label],
      bottomColor: 'transparent',
      crosshairMarkerBackgroundColor: lineColors[label],
      crosshairMarkerBorderColor: '#06080a',
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerRadius: 4,
    });

    if (data.length > 0) {
      const chartData: LineData[] = data.map(d => ({
        time: Math.floor(d.ts / 1000) as unknown as Time,
        value: d.score,
      }));
      series.setData(chartData);
    }

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, label, height]);

  return (
    <div className="bg-surface-1 border border-subtle/20 rounded-2xl p-5 opacity-0 animate-fade-in stagger-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-display font-semibold text-muted uppercase tracking-wider">Score History</h3>
        <span className="text-[10px] font-mono text-muted">{data.length} points</span>
      </div>
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />
    </div>
  );
}
