/**
 * Canvas-based renderer for the latency scatter chart.
 *
 * Replaces the previous Recharts <Scatter> + one <Cell> per point, which
 * created one SVG node and one React fiber per point. At a few thousand
 * points that DOM/fiber overhead is what froze the tab, not just the data
 * volume (already bounded server-side). Canvas draw calls have no such
 * per-point overhead, so this stays smooth well past what SVG could handle.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface LatencyChartPoint {
    x: number; // epoch ms
    latency: number;
    timestamp: string;
}

export interface LatencyLossPoint {
    x: number;
    timestamp: string;
}

interface LatencyCanvasChartProps {
    data: LatencyChartPoint[];
    lossData: LatencyLossPoint[];
    yDomain: [number, number];
    formatXAxis: (tickItem: number) => string;
}

export const getLatencyColor = (latency: number | null): string => {
    if (latency === null) return '#ef4444'; // Packet loss
    if (latency < 50) return '#10b981'; // Green
    if (latency < 100) return '#f59e0b'; // Yellow/Orange
    if (latency < 150) return '#f97316'; // Orange
    return '#ef4444'; // Red
};

const MARGIN = { top: 16, right: 24, bottom: 34, left: 50 };
const HOVER_THRESHOLD_PX = 15;

export const LatencyCanvasChart: React.FC<LatencyCanvasChartProps> = ({
    data,
    lossData,
    yDomain,
    formatXAxis
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [hover, setHover] = useState<{ point: LatencyChartPoint; px: number; py: number } | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const { width, height } = entry.contentRect;
            setSize({ width, height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const xDomain = useMemo<[number, number]>(() => {
        const xs = [...data.map(d => d.x), ...lossData.map(d => d.x)];
        if (xs.length === 0) return [0, 1];
        return [Math.min(...xs), Math.max(...xs)];
    }, [data, lossData]);

    const scaleX = useCallback((t: number) => {
        const [x0, x1] = xDomain;
        const plotWidth = size.width - MARGIN.left - MARGIN.right;
        if (x1 === x0) return MARGIN.left + plotWidth / 2;
        return MARGIN.left + ((t - x0) / (x1 - x0)) * plotWidth;
    }, [xDomain, size.width]);

    const scaleY = useCallback((v: number) => {
        const [y0, y1] = yDomain;
        const plotHeight = size.height - MARGIN.top - MARGIN.bottom;
        if (y1 === y0) return MARGIN.top + plotHeight / 2;
        return MARGIN.top + plotHeight - ((v - y0) / (y1 - y0)) * plotHeight;
    }, [yDomain, size.height]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || size.width === 0 || size.height === 0) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = size.width * dpr;
        canvas.height = size.height * dpr;
        canvas.style.width = `${size.width}px`;
        canvas.style.height = `${size.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size.width, size.height);

        const plotLeft = MARGIN.left;
        const plotTop = MARGIN.top;
        const plotWidth = size.width - MARGIN.left - MARGIN.right;
        const plotHeight = size.height - MARGIN.top - MARGIN.bottom;
        if (plotWidth <= 0 || plotHeight <= 0) return;

        // Horizontal grid + Y labels
        ctx.font = '11px sans-serif';
        const yTicks = 5;
        for (let i = 0; i <= yTicks; i++) {
            const v = yDomain[0] + ((yDomain[1] - yDomain[0]) * i) / yTicks;
            const py = scaleY(v);
            ctx.strokeStyle = '#374151';
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(plotLeft, py);
            ctx.lineTo(plotLeft + plotWidth, py);
            ctx.stroke();

            ctx.fillStyle = '#6b7280';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(v.toFixed(v < 10 ? 1 : 0), plotLeft - 8, py);
        }

        // Vertical grid + X labels
        const xTickCount = Math.max(2, Math.min(10, Math.floor(plotWidth / 90)));
        for (let i = 0; i <= xTickCount; i++) {
            const t = xDomain[0] + ((xDomain[1] - xDomain[0]) * i) / xTickCount;
            const px = scaleX(t);
            ctx.strokeStyle = '#2a2a2a';
            ctx.setLineDash([1, 1]);
            ctx.beginPath();
            ctx.moveTo(px, plotTop);
            ctx.lineTo(px, plotTop + plotHeight);
            ctx.stroke();

            ctx.fillStyle = '#6b7280';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(formatXAxis(t), px, plotTop + plotHeight + 6);
        }
        ctx.setLineDash([]);

        // Axis borders
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plotLeft, plotTop);
        ctx.lineTo(plotLeft, plotTop + plotHeight);
        ctx.lineTo(plotLeft + plotWidth, plotTop + plotHeight);
        ctx.stroke();

        // Packet loss markers
        ctx.strokeStyle = '#ef4444';
        for (const loss of lossData) {
            const px = scaleX(loss.x);
            ctx.beginPath();
            ctx.moveTo(px, plotTop);
            ctx.lineTo(px, plotTop + plotHeight);
            ctx.stroke();
        }

        // Points
        const radius = data.length > 5000 ? 1.5 : data.length > 2000 ? 2.5 : data.length > 1000 ? 3 : 4;
        for (const point of data) {
            const px = scaleX(point.x);
            const py = scaleY(point.latency);
            ctx.beginPath();
            ctx.fillStyle = getLatencyColor(point.latency);
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }, [data, lossData, size, xDomain, yDomain, formatXAxis, scaleX, scaleY]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (data.length === 0) {
            setHover(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        let nearest = data[0];
        let nearestDist = Infinity;
        for (const point of data) {
            const dist = Math.abs(scaleX(point.x) - mx);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = point;
            }
        }

        if (nearestDist > HOVER_THRESHOLD_PX) {
            setHover(null);
            return;
        }
        setHover({ point: nearest, px: mx, py: my });
    }, [data, scaleX]);

    const handleMouseLeave = useCallback(() => setHover(null), []);

    return (
        <div ref={containerRef} className="relative w-full h-full">
            <canvas
                ref={canvasRef}
                className="absolute inset-0 cursor-crosshair"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            />
            {hover && (
                <div
                    className="absolute z-10 bg-[#1f2937] border border-gray-700 rounded-lg p-3 shadow-lg pointer-events-none"
                    style={{
                        left: Math.min(hover.px + 12, Math.max(size.width - 180, 0)),
                        top: Math.max(hover.py - 60, 4)
                    }}
                >
                    <p className="text-gray-300 text-sm mb-1">
                        {new Date(hover.point.timestamp).toLocaleString('fr-FR')}
                    </p>
                    <p className="text-white font-medium">
                        Latence: <span style={{ color: getLatencyColor(hover.point.latency) }}>{hover.point.latency.toFixed(3)}ms</span>
                    </p>
                </div>
            )}
        </div>
    );
};
