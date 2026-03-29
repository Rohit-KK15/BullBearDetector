'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
} from 'lightweight-charts';
import type { PricePoint } from '@bull-bear/shared';

type ChartMode = 'candle' | 'line';

interface PriceChartProps {
  data: PricePoint[];
  label: 'bull' | 'neutral' | 'bear';
  height?: number;
}

const lineColors = {
  bull: '#00e87b',
  bear: '#ff3b5c',
  neutral: '#ffb224',
};

const areaTopColors = {
  bull: 'rgba(0, 232, 123, 0.12)',
  bear: 'rgba(255, 59, 92, 0.12)',
  neutral: 'rgba(255, 178, 36, 0.12)',
};

const upColor = '#00e87b';
const downColor = '#ff3b5c';

const tzOffsetSec = new Date().getTimezoneOffset() * -60;
function toLocalTime(tsMs: number): Time {
  return (Math.floor(tsMs / 1000) + tzOffsetSec) as unknown as Time;
}

function makeChartOptions(height: number) {
  return {
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
      scaleMargins: { top: 0.05, bottom: 0.05 },
    },
    timeScale: {
      borderColor: 'rgba(58, 68, 85, 0.3)',
      timeVisible: true,
      secondsVisible: false,
      lockVisibleTimeRangeOnResize: true,
      rightOffset: 3,
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true },
    handleScale: { mouseWheel: true, pinch: true },
    crosshair: {
      vertLine: { color: 'rgba(90, 101, 120, 0.3)', width: 1 as const, style: 3 as const },
      horzLine: { color: 'rgba(90, 101, 120, 0.3)', width: 1 as const, style: 3 as const },
    },
  };
}

export function PriceChart({ data, label, height = 280 }: PriceChartProps) {
  const [mode, setMode] = useState<ChartMode>('candle');
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null>(null);
  const fittedRef = useRef(false);

  const validData = useMemo(() => data.filter(d => d.open > 0 && d.close > 0), [data]);

  // Recreate chart when mode changes
  useEffect(() => {
    if (!containerRef.current) return;
    fittedRef.current = false;

    const chart = createChart(containerRef.current, makeChartOptions(height));

    let series: ISeriesApi<'Candlestick'> | ISeriesApi<'Area'>;

    if (mode === 'candle') {
      series = chart.addCandlestickSeries({
        upColor,
        downColor,
        borderUpColor: upColor,
        borderDownColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor,
      });
    } else {
      series = chart.addAreaSeries({
        lineColor: lineColors[label],
        lineWidth: 2,
        topColor: areaTopColors[label],
        bottomColor: 'transparent',
        crosshairMarkerBackgroundColor: lineColors[label],
        crosshairMarkerBorderColor: '#06080a',
        crosshairMarkerBorderWidth: 2,
        crosshairMarkerRadius: 4,
        lastValueVisible: true,
        priceLineVisible: true,
      });
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
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [mode, height]);

  // Update line colors when label changes
  useEffect(() => {
    if (!seriesRef.current || mode !== 'line') return;
    (seriesRef.current as ISeriesApi<'Area'>).applyOptions({
      lineColor: lineColors[label],
      topColor: areaTopColors[label],
      crosshairMarkerBackgroundColor: lineColors[label],
    });
  }, [label, mode]);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || validData.length === 0) return;

    if (mode === 'candle') {
      const candleData: CandlestickData[] = validData.map(d => ({
        time: toLocalTime(d.ts),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      (seriesRef.current as ISeriesApi<'Candlestick'>).setData(candleData);
    } else {
      const lineData: LineData[] = validData.map(d => ({
        time: toLocalTime(d.ts),
        value: d.close,
      }));
      (seriesRef.current as ISeriesApi<'Area'>).setData(lineData);
    }

    // Only fit on first load
    if (!fittedRef.current) {
      chartRef.current.timeScale().fitContent();
      fittedRef.current = true;
    }
  }, [validData, mode]);

  return (
    <div className="bg-surface-1 border border-subtle/20 rounded-2xl p-5 opacity-0 animate-fade-in stagger-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-display font-semibold text-muted uppercase tracking-wider">Price</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted mr-2">{validData.length} pts</span>
          <div className="flex bg-surface-3/50 rounded-md p-0.5">
            <button
              onClick={() => setMode('candle')}
              aria-pressed={mode === 'candle'}
              className={`px-2 py-1 rounded text-[11px] font-mono transition-all duration-150 ${
                mode === 'candle'
                  ? 'bg-surface-4 text-white shadow-sm'
                  : 'text-muted hover:text-white/70'
              }`}
            >
              Candle
            </button>
            <button
              onClick={() => setMode('line')}
              aria-pressed={mode === 'line'}
              className={`px-2 py-1 rounded text-[11px] font-mono transition-all duration-150 ${
                mode === 'line'
                  ? 'bg-surface-4 text-white shadow-sm'
                  : 'text-muted hover:text-white/70'
              }`}
            >
              Line
            </button>
          </div>
        </div>
      </div>
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden" role="img" aria-label={`Price ${mode} chart`} />
    </div>
  );
}
