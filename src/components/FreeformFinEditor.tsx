import React, { useRef, useState, useCallback, useEffect } from 'react';
import { FreeformFinSet } from '../types/rocket';

interface FreeformFinEditorProps {
    comp: FreeformFinSet;
    update: (u: Partial<FreeformFinSet>) => void;
}

/* Interactive 2D fin profile editor.
   User clicks to add points, drags to move, right-click to delete.
   X axis = chord direction (mm), Y axis = span/height (mm). */
export const FreeformFinEditor: React.FC<FreeformFinEditorProps> = ({ comp, update }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [hovering, setHovering] = useState<number | null>(null);

    const canvasW = 320;
    const canvasH = 240;
    const margin = 30;
    const drawW = canvasW - margin * 2;
    const drawH = canvasH - margin * 2;

    // Compute bounds from points
    const pts = comp.points;
    const maxX = Math.max(0.001, ...pts.map(p => p[0]));
    const maxY = Math.max(0.001, ...pts.map(p => p[1]));
    const scaleRange = Math.max(maxX, maxY) * 1.3;

    const toSvgX = (m: number) => margin + (m / scaleRange) * drawW;
    const toSvgY = (m: number) => canvasH - margin - (m / scaleRange) * drawH;
    const fromSvgX = (px: number) => ((px - margin) / drawW) * scaleRange;
    const fromSvgY = (py: number) => ((canvasH - margin - py) / drawH) * scaleRange;

    const getSvgPoint = useCallback((e: React.MouseEvent): [number, number] => {
        const svg = svgRef.current;
        if (!svg) return [0, 0];
        const rect = svg.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        return [Math.max(0, fromSvgX(px)), Math.max(0, fromSvgY(py))];
    }, [scaleRange]);

    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        if (dragging !== null) return;
        const [x, y] = getSvgPoint(e);
        if (x < 0 || y < 0) return;

        // Find nearest edge to insert the point into
        const newPts = [...pts];
        let bestIdx = newPts.length - 1;
        let bestDist = Infinity;

        for (let i = 0; i < newPts.length; i++) {
            const j = (i + 1) % newPts.length;
            const [ax, ay] = newPts[i];
            const [bx, by] = newPts[j];
            const dx = bx - ax, dy = by - ay;
            const len2 = dx * dx + dy * dy;
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
            const px = ax + t * dx, py = ay + t * dy;
            const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = j;
            }
        }

        newPts.splice(bestIdx, 0, [x, y]);
        update({ points: newPts });
    }, [pts, getSvgPoint, dragging, update]);

    const handlePointMouseDown = useCallback((idx: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (e.button === 2) {
            // Right-click: remove point (keep min 3)
            if (pts.length <= 3) return;
            const newPts = pts.filter((_, i) => i !== idx);
            update({ points: newPts });
            return;
        }
        setDragging(idx);
    }, [pts, update]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (dragging === null) return;
        const [x, y] = getSvgPoint(e);
        const newPts = [...pts];
        newPts[dragging] = [Math.max(0, x), Math.max(0, y)];
        update({ points: newPts });
    }, [dragging, pts, getSvgPoint, update]);

    const handleMouseUp = useCallback(() => {
        setDragging(null);
    }, []);

    useEffect(() => {
        const up = () => setDragging(null);
        window.addEventListener('mouseup', up);
        return () => window.removeEventListener('mouseup', up);
    }, []);

    // Grid lines
    const gridStep = scaleRange / 5;
    const gridLines = [];
    for (let g = 0; g <= scaleRange * 1.1; g += gridStep) {
        gridLines.push(g);
    }

    // Build polygon path
    const polyPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toSvgX(p[0]).toFixed(1)} ${toSvgY(p[1]).toFixed(1)}`).join(' ') + ' Z';

    return (
        <div className="editor-section">
            <h4>Freeform Fin Profile</h4>
            <p className="editor-hint">Click to add points. Drag to move. Right-click to remove.</p>

            <svg
                ref={svgRef}
                width={canvasW}
                height={canvasH}
                style={{ background: '#1a1d23', borderRadius: 4, border: '1px solid #363b44', cursor: dragging !== null ? 'grabbing' : 'crosshair', display: 'block', margin: '6px 0' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onClick={handleCanvasClick}
                onContextMenu={e => e.preventDefault()}
            >
                {/* Grid */}
                {gridLines.map((g, i) => (
                    <g key={i}>
                        <line x1={toSvgX(g)} y1={toSvgY(0)} x2={toSvgX(g)} y2={toSvgY(scaleRange)} stroke="#252930" strokeWidth={0.5} />
                        <line x1={toSvgX(0)} y1={toSvgY(g)} x2={toSvgX(scaleRange)} y2={toSvgY(g)} stroke="#252930" strokeWidth={0.5} />
                    </g>
                ))}

                {/* Axes */}
                <line x1={toSvgX(0)} y1={toSvgY(0)} x2={toSvgX(scaleRange * 1.05)} y2={toSvgY(0)} stroke="#5c6370" strokeWidth={1} />
                <line x1={toSvgX(0)} y1={toSvgY(0)} x2={toSvgX(0)} y2={toSvgY(scaleRange * 1.05)} stroke="#5c6370" strokeWidth={1} />
                <text x={toSvgX(scaleRange * 0.95)} y={toSvgY(0) + 14} fontSize="9" fill="#5c6370" textAnchor="middle" fontFamily="'JetBrains Mono',monospace">
                    chord ({(scaleRange * 1000).toFixed(0)} mm)
                </text>
                <text x={toSvgX(0) - 4} y={toSvgY(scaleRange * 0.85)} fontSize="9" fill="#5c6370" textAnchor="end" fontFamily="'JetBrains Mono',monospace">
                    span
                </text>

                {/* Body tube line (root chord at y=0) */}
                <line x1={toSvgX(0)} y1={toSvgY(0)} x2={toSvgX(maxX * 1.2)} y2={toSvgY(0)} stroke="#3b8eed" strokeWidth={1.5} opacity={0.5} />

                {/* Filled fin shape */}
                <path d={polyPath} fill="#c8843c" fillOpacity={0.3} stroke="#c8843c" strokeWidth={1.5} strokeLinejoin="round" />

                {/* Edge lines with labels */}
                {pts.map((p, i) => {
                    const j = (i + 1) % pts.length;
                    const [x1, y1] = p;
                    const [x2, y2] = pts[j];
                    const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
                    if (len < 0.0001) return null;
                    const mx = (toSvgX(x1) + toSvgX(x2)) / 2;
                    const my = (toSvgY(y1) + toSvgY(y2)) / 2;
                    return (
                        <text key={`edge-${i}`} x={mx} y={my - 4} fontSize="7" fill="#8b919c" textAnchor="middle" fontFamily="'JetBrains Mono',monospace">
                            {(len * 1000).toFixed(1)}
                        </text>
                    );
                })}

                {/* Points */}
                {pts.map((p, i) => (
                    <g key={i}>
                        <circle
                            cx={toSvgX(p[0])}
                            cy={toSvgY(p[1])}
                            r={hovering === i || dragging === i ? 6 : 4}
                            fill={dragging === i ? '#3b8eed' : hovering === i ? '#e67e22' : '#ced4de'}
                            stroke="#1a1d23"
                            strokeWidth={1.5}
                            style={{ cursor: 'grab' }}
                            onMouseDown={e => handlePointMouseDown(i, e)}
                            onMouseEnter={() => setHovering(i)}
                            onMouseLeave={() => setHovering(null)}
                        />
                        <text
                            x={toSvgX(p[0]) + 8}
                            y={toSvgY(p[1]) - 6}
                            fontSize="7"
                            fill="#5c6370"
                            fontFamily="'JetBrains Mono',monospace"
                        >
                            ({(p[0] * 1000).toFixed(1)}, {(p[1] * 1000).toFixed(1)})
                        </text>
                    </g>
                ))}
            </svg>

            <div className="field">
                <label>Number of Fins</label>
                <input type="number" min={1} max={8} value={comp.finCount}
                    onChange={e => update({ finCount: parseInt(e.target.value) || 3 })} />
            </div>
            <div className="field">
                <label>Thickness (mm)</label>
                <input type="number" step={0.1} value={(comp.thickness * 1000).toFixed(1)}
                    onChange={e => update({ thickness: (parseFloat(e.target.value) || 3) / 1000 })} />
            </div>
            <div className="field">
                <label>Cross Section</label>
                <select value={comp.crossSection} onChange={e => update({ crossSection: e.target.value as any })}>
                    <option value="square">Square</option>
                    <option value="rounded">Rounded</option>
                    <option value="airfoil">Airfoil</option>
                    <option value="wedge">Wedge</option>
                </select>
            </div>

            {/* Points table */}
            <div className="fin-points-table">
                <table>
                    <thead>
                        <tr><th>#</th><th>X (mm)</th><th>Y (mm)</th><th></th></tr>
                    </thead>
                    <tbody>
                        {pts.map((p, i) => (
                            <tr key={i}>
                                <td style={{ color: '#5c6370' }}>{i + 1}</td>
                                <td>
                                    <input type="number" step={0.1} value={(p[0] * 1000).toFixed(1)}
                                        onChange={e => {
                                            const newPts = [...pts];
                                            newPts[i] = [Math.max(0, parseFloat(e.target.value) || 0) / 1000, p[1]];
                                            update({ points: newPts });
                                        }} />
                                </td>
                                <td>
                                    <input type="number" step={0.1} value={(p[1] * 1000).toFixed(1)}
                                        onChange={e => {
                                            const newPts = [...pts];
                                            newPts[i] = [p[0], Math.max(0, parseFloat(e.target.value) || 0) / 1000];
                                            update({ points: newPts });
                                        }} />
                                </td>
                                <td>
                                    {pts.length > 3 && (
                                        <button className="btn-remove-point" onClick={() => {
                                            update({ points: pts.filter((_, j) => j !== i) });
                                        }}>✕</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
