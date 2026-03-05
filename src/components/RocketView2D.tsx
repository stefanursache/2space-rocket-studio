import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { getComponentPositions, getMaxRadius, getRocketLength } from '../physics/aerodynamics';
import { NoseCone, BodyTube, Transition, TrapezoidFinSet, EllipticalFinSet, FreeformFinSet, Airbrakes, Motor, RocketComponent } from '../types/rocket';

/* =====================================================================
   2SPACE Rocket Studio – 2D Engineering Blueprint View
   CAD-style infinite canvas with scroll-zoom + drag-pan
   ===================================================================== */

/* -- Theme tokens ---------------------------------------------------- */
const T = {
    bg: '#13161b',
    grid: '#1e232c',
    gridMajor: '#252b38',
    gridText: '#3a4050',
    accent: '#4a9ef5',
    sel: '#4a9ef5',
    center: '#b8306a',
    extent: '#2e6ab8',
    body: '#a0a8b8',
    fins: '#6c9fd4',
    inner: '#d4a050',
    engine: '#c44a30',
    ring: '#9b5cc0',
    recovery: '#3cba6c',
    shock: '#e88e30',
    mass: '#e8c840',
    muted: '#5c6370',
    dimLine: '#3b4754',
    font: "'JetBrains Mono', monospace",
};

const COMP_COLORS: Record<string, string> = {
    nosecone: T.body, bodytube: T.body, transition: T.body,
    trapezoidfinset: T.fins, ellipticalfinset: T.fins, freeformfinset: T.fins,
    innertube: T.inner, engineblock: T.engine, centeringring: T.ring,
    bulkhead: T.engine, tubecoupler: '#3a8ec0', parachute: T.recovery,
    streamer: '#40c878', shockcord: T.shock, launchlug: '#7f8c8d', massobject: T.mass,
    airbrakes: '#e07020',
};
const FONT = T.font;

/* ---- Pan/Zoom state ---- */
interface ViewTransform {
    panX: number;
    panY: number;
    scale: number; // px per meter
}

export const RocketView2D: React.FC = () => {
    const { rocket, viewOrientation, zoom, stability, selectedComponentId, selectComponent, selectedMotor, motorPosition } = useStore();
    const positions = useMemo(() => getComponentPositions(rocket), [rocket]);
    const totalLength = useMemo(() => getRocketLength(rocket), [rocket]);
    const maxRadius = useMemo(() => getMaxRadius(rocket), [rocket]);

    if (positions.length === 0) {
        return (
            <div className="rocket-view-2d" style={{ background: T.bg }}>
                <svg width="100%" height="100%">
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
                        fill={T.muted} fontSize="14" fontFamily={FONT}>
                        Add components to see the rocket
                    </text>
                </svg>
            </div>
        );
    }

    if (viewOrientation === 'side') {
        return <SideViewCanvas positions={positions} rocket={rocket} totalLength={totalLength}
            maxRadius={maxRadius} baseZoom={zoom} stability={stability}
            selectedId={selectedComponentId} onSelect={selectComponent}
            motor={selectedMotor} motorPosition={motorPosition} />;
    }
    const scale = zoom * 600;
    return <BackView positions={positions} rocket={rocket} maxRadius={maxRadius} scale={scale} />;
};

/* ---------- helper: max fin height ---------- */
function getMaxFinHeight(rocket: any): number {
    let m = 0;
    for (const st of rocket.stages) for (const c of st.components) {
        if (c.type === 'bodytube' && c.children) for (const ch of c.children) {
            if (ch.type === 'trapezoidfinset' || ch.type === 'ellipticalfinset') m = Math.max(m, ch.height);
            if (ch.type === 'freeformfinset') m = Math.max(m, ...ch.points.map((p: number[]) => p[1]));
        }
    }
    return m;
}

function getCompMass(c: RocketComponent): number | undefined {
    return (c.massOverridden && c.mass) ? c.mass : undefined;
}

/* =================================================================
   SIDE VIEW — infinite canvas with zoom/pan
   ================================================================= */
const SideViewCanvas: React.FC<{
    positions: any[]; rocket: any; totalLength: number; maxRadius: number;
    baseZoom: number; stability: any; selectedId: string | null; onSelect: (id: string) => void;
    motor: Motor | null; motorPosition: number;
}> = ({ positions, rocket, totalLength, maxRadius, baseZoom, stability, selectedId, onSelect, motor, motorPosition }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 800, h: 500 });
    const [transform, setTransform] = useState<ViewTransform | null>(null);
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

    // Observe container size
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        if (width > 0 && height > 0) setSize({ w: width, h: height });
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) setSize({ w: width, h: height });
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Compute "fit" transform: center rocket with some margin
    const fitTransform = useMemo((): ViewTransform => {
        const finH = getMaxFinHeight(rocket);
        const rocketH = (maxRadius + finH) * 2;
        const marginFactor = 1.4;
        const scaleX = size.w / (totalLength * marginFactor);
        const scaleY = size.h / (rocketH * marginFactor);
        const s = Math.min(scaleX, scaleY, 50000);
        return {
            scale: Math.max(s, 10),
            panX: (size.w - totalLength * s) / 2,
            panY: size.h / 2,
        };
    }, [size.w, size.h, totalLength, maxRadius, rocket]);

    const vt = transform ?? fitTransform;

    // Reset to fit on external changes
    useEffect(() => { setTransform(null); }, [baseZoom, totalLength, maxRadius]);

    // Wheel -> zoom toward cursor
    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setTransform(prev => {
            const cur = prev ?? fitTransform;
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            const newScale = Math.max(10, Math.min(200000, cur.scale * factor));
            const ratio = newScale / cur.scale;
            return { scale: newScale, panX: mx - (mx - cur.panX) * ratio, panY: my - (my - cur.panY) * ratio };
        });
    }, [fitTransform]);

    // Pan on left-click drag on background, or middle-click anywhere
    const onPointerDown = useCallback((e: React.PointerEvent) => {
        const isBg = (e.target as Element).getAttribute('data-bg') === '1';
        if (e.button === 1 || (e.button === 0 && isBg)) {
            isPanning.current = true;
            const cur = transform ?? fitTransform;
            panStart.current = { x: e.clientX, y: e.clientY, px: cur.panX, py: cur.panY };
            (e.target as Element).setPointerCapture?.(e.pointerId);
            e.preventDefault();
        }
    }, [transform, fitTransform]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!isPanning.current) return;
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        const cur = transform ?? fitTransform;
        setTransform({ scale: cur.scale, panX: panStart.current.px + dx, panY: panStart.current.py + dy });
    }, [transform, fitTransform]);

    const onPointerUp = useCallback(() => { isPanning.current = false; }, []);

    // Double-click -> reset
    const onDoubleClick = useCallback(() => { setTransform(null); }, []);

    const { w, h } = size;
    const s = vt.scale;
    const ox = vt.panX;
    const oy = vt.panY;
    const finH = getMaxFinHeight(rocket);

    return (
        <div ref={containerRef} className="rocket-view-2d"
            style={{ background: T.bg, cursor: isPanning.current ? 'grabbing' : 'default', overflow: 'hidden' }}>
            <svg width={w} height={h} style={{ display: 'block' }}
                onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                onPointerUp={onPointerUp} onDoubleClick={onDoubleClick}>
                <rect width={w} height={h} fill={T.bg} data-bg="1" style={{ cursor: 'grab' }} />

                <defs>
                    <linearGradient id="nose-fill" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#b0b8c8" stopOpacity="0.04" />
                        <stop offset="100%" stopColor={T.body} stopOpacity="0.14" />
                    </linearGradient>
                    <linearGradient id="body-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.05" />
                        <stop offset="100%" stopColor="#000000" stopOpacity="0.02" />
                    </linearGradient>
                    <filter id="sel-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                        <feColorMatrix in="blur" type="matrix"
                            values="0 0 0 0 0.29  0 0 0 0 0.62  0 0 0 0 0.96  0 0 0 0.45 0" />
                        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* Infinite mm grid */}
                <InfiniteGrid w={w} h={h} ox={ox} oy={oy} scale={s} />

                {/* Center axis */}
                <line x1={0} y1={oy} x2={w} y2={oy}
                    stroke={T.center} strokeWidth={0.5} opacity={0.22} strokeDasharray="8,4" />

                {/* Components */}
                {positions.map(pos => {
                    const comp = pos.component;
                    const x = ox + pos.xStart * s;
                    const sel = comp.id === selectedId;
                    if (comp.type === 'nosecone')
                        return <NoseCone2D key={comp.id} comp={comp} x={x} centerY={oy} scale={s}
                            sel={sel} onClick={() => onSelect(comp.id)} selectedId={selectedId} onSelect={onSelect} />;
                    if (comp.type === 'bodytube')
                        return <BodyTube2D key={comp.id} comp={comp} x={x} centerY={oy} scale={s}
                            sel={sel} onClick={() => onSelect(comp.id)} selectedId={selectedId} onSelect={onSelect} />;
                    if (comp.type === 'transition')
                        return <Transition2D key={comp.id} comp={comp} x={x} centerY={oy} scale={s}
                            sel={sel} onClick={() => onSelect(comp.id)} />;
                    return null;
                })}

                {/* Motor */}
                {motor && <Motor2D motor={motor} motorPosition={motorPosition} scale={s} ox={ox} centerY={oy} />}

                {/* CG / CP markers */}
                {stability && stability.totalLength > 0 && <>
                    <CGMarker x={ox + stability.cg * s} centerY={oy} maxR={(maxRadius + finH) * s} />
                    <CPMarker x={ox + stability.cp * s} centerY={oy} maxR={(maxRadius + finH) * s} />
                </>}

                {/* Diameter callout */}
                {maxRadius > 0 && (
                    <DiameterCallout x={ox + totalLength * s + 10} centerY={oy}
                        radius={maxRadius * s} diameterMm={maxRadius * 2000} />
                )}

                {/* Total length dimension */}
                <LengthDimension x1={ox} x2={ox + totalLength * s}
                    y={oy + (maxRadius + finH) * s + 40} lengthMm={totalLength * 1000}
                    centerY={oy} maxR={(maxRadius + finH) * s} />

                {/* HUD: zoom %, hint text */}
                <text x={w - 8} y={h - 8} textAnchor="end" fontSize="10" fill={T.gridText}
                    fontFamily={FONT} opacity={0.45} pointerEvents="none">
                    {(s / fitTransform.scale * 100).toFixed(0)}%
                </text>
                <text x={8} y={h - 8} fontSize="9" fill={T.gridText} fontFamily={FONT}
                    opacity={0.3} pointerEvents="none">
                    {'scroll \u00b7 zoom   drag \u00b7 pan   dbl-click \u00b7 reset'}
                </text>
            </svg>
        </div>
    );
};

/* ---------- INFINITE GRID ---------- */
const InfiniteGrid: React.FC<{
    w: number; h: number; ox: number; oy: number; scale: number;
}> = ({ w, h, ox, oy, scale }) => {
    const mmPerPx = 1000 / scale;
    const spacings = [1, 2, 5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000];
    const minorMm = spacings.find(s => s / mmPerPx >= 30) || 5000;
    const majorMm = minorMm * 5;

    const els: React.ReactElement[] = [];

    // Vertical
    const xStart = Math.floor((-ox / scale) * 1000 / minorMm) * minorMm;
    const xEnd = Math.ceil(((-ox + w) / scale) * 1000 / minorMm) * minorMm;
    for (let mm = xStart; mm <= xEnd; mm += minorMm) {
        const px = ox + (mm / 1000) * scale;
        if (px < -1 || px > w + 1) continue;
        const isMajor = mm % majorMm === 0;
        els.push(<line key={`v${mm}`} x1={px} y1={0} x2={px} y2={h}
            stroke={isMajor ? T.gridMajor : T.grid} strokeWidth={isMajor ? 0.6 : 0.3} />);
        if (isMajor) els.push(
            <text key={`vt${mm}`} x={px} y={12} textAnchor="middle" fontSize="9"
                fill={T.gridText} fontFamily={FONT}>{mm}</text>
        );
    }

    // Horizontal (symmetric about center line)
    const yMaxMm = Math.ceil(Math.max(oy, h - oy) / scale * 1000 / minorMm) * minorMm;
    for (let mm = minorMm; mm <= yMaxMm; mm += minorMm) {
        const dy = (mm / 1000) * scale;
        const isMajor = mm % majorMm === 0;
        const yU = oy - dy, yD = oy + dy;
        if (yU > -1 && yU < h + 1)
            els.push(<line key={`hu${mm}`} x1={0} y1={yU} x2={w} y2={yU}
                stroke={isMajor ? T.gridMajor : T.grid} strokeWidth={isMajor ? 0.6 : 0.3} />);
        if (yD > -1 && yD < h + 1)
            els.push(<line key={`hd${mm}`} x1={0} y1={yD} x2={w} y2={yD}
                stroke={isMajor ? T.gridMajor : T.grid} strokeWidth={isMajor ? 0.6 : 0.3} />);
        if (isMajor && yU > 0 && yU < h)
            els.push(<text key={`hut${mm}`} x={6} y={yU + 3.5} fontSize="9"
                fill={T.gridText} fontFamily={FONT}>{mm}</text>);
    }

    return <g opacity={0.6}>{els}</g>;
};

/* ---------- NOSE CONE ---------- */
const NoseCone2D: React.FC<{
    comp: NoseCone; x: number; centerY: number; scale: number; sel: boolean; onClick: () => void;
    selectedId?: string | null; onSelect?: (id: string) => void;
}> = ({ comp, x, centerY, scale, sel, onClick, selectedId, onSelect }) => {
    const l = comp.length * scale, r = comp.baseRadius * scale;
    const stroke = sel ? T.sel : T.body;
    const sw = sel ? 1.6 : 0.9;
    const pts = noseProfile(comp, l, r);
    const top = pts.map(([px, py]) => `${x + px},${centerY - py}`);
    const bot = [...pts].reverse().map(([px, py]) => `${x + px},${centerY + py}`);
    return (
        <g onClick={onClick} style={{ cursor: 'pointer' }} filter={sel ? 'url(#sel-glow)' : undefined}>
            <polygon points={[...top, ...bot].join(' ')} fill="url(#nose-fill)" stroke={stroke}
                strokeWidth={sw} strokeLinejoin="round" />
            {comp.shoulderLength > 0 && comp.shoulderRadius > 0 && (
                <rect x={x + l} y={centerY - comp.shoulderRadius * scale}
                    width={comp.shoulderLength * scale} height={comp.shoulderRadius * scale * 2}
                    fill="none" stroke={stroke} strokeWidth={sw * 0.5} strokeDasharray="3,2" opacity={0.4} />
            )}
            {sel && <CLabel x={x + l / 2} y={centerY - r - 18} name={comp.name} color={stroke} />}
            {comp.children && selectedId != null && onSelect && comp.children.map(child =>
                renderChild(child, x, l, r, centerY, scale, selectedId, onSelect)
            )}
        </g>
    );
};

function noseProfile(comp: NoseCone, l: number, r: number): [number, number][] {
    const pts: [number, number][] = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
        const t = i / N, xp = t * l;
        let yp: number;
        switch (comp.shape) {
            case 'conical': yp = r * t; break;
            case 'ogive': { const rho = (r * r + l * l) / (2 * r); yp = Math.max(0, Math.sqrt(rho * rho - (l - xp) * (l - xp)) - (rho - r)); break; }
            case 'ellipsoid': yp = r * Math.sqrt(1 - (1 - t) * (1 - t)); break;
            case 'power': yp = r * Math.pow(t, comp.shapeParameter || 0.5); break;
            case 'parabolic': yp = r * (2 * t - t * t); break;
            case 'haack': { const th = Math.acos(1 - 2 * t); yp = r * Math.sqrt((th - Math.sin(2 * th) / 2) / Math.PI); break; }
            default: yp = r * t;
        }
        pts.push([xp, yp]);
    }
    return pts;
}

/* ---------- BODY TUBE ---------- */
const BodyTube2D: React.FC<{
    comp: BodyTube; x: number; centerY: number; scale: number; sel: boolean; onClick: () => void;
    selectedId: string | null; onSelect: (id: string) => void;
}> = ({ comp, x, centerY, scale, sel, onClick, selectedId, onSelect }) => {
    const l = comp.length * scale, r = comp.outerRadius * scale, ir = comp.innerRadius * scale;
    const stroke = sel ? T.sel : T.body;
    const sw = sel ? 1.6 : 0.9;
    return (
        <g>
            <rect x={x} y={centerY - r} width={l} height={r * 2} rx={0.5}
                fill="url(#body-fill)" stroke={stroke} strokeWidth={sw} onClick={onClick}
                style={{ cursor: 'pointer' }} filter={sel ? 'url(#sel-glow)' : undefined} />
            {ir > 0 && ir < r && (
                <rect x={x} y={centerY - ir} width={l} height={ir * 2}
                    fill="none" stroke={T.dimLine} strokeWidth={0.35} strokeDasharray="3,3" pointerEvents="none" />
            )}
            {comp.children?.map(child => renderChild(child, x, l, r, centerY, scale, selectedId, onSelect))}
        </g>
    );
};

/* ---------- renderChild ---------- */
function renderChild(
    child: RocketComponent, bodyX: number, bodyL: number, bodyR: number,
    centerY: number, scale: number, selectedId: string | null, onSelect: (id: string) => void
): React.ReactElement | null {
    const cSel = child.id === selectedId;
    const cStroke = cSel ? T.sel : (COMP_COLORS[child.type] || T.body);
    const cSW = cSel ? 1.4 : 0.8;
    const childPos = ('position' in child && typeof (child as any).position === 'number') ? (child as any).position * scale : 0;
    const childX = bodyX + childPos;
    const clk = () => onSelect(child.id);

    switch (child.type) {
        case 'trapezoidfinset': return <TrapFin2D key={child.id} comp={child as TrapezoidFinSet}
            bodyX={bodyX} bodyLength={bodyL} bodyRadius={bodyR} centerY={centerY} scale={scale}
            stroke={cStroke} strokeWidth={cSW} onClick={clk} childPos={childPos} sel={cSel} />;
        case 'ellipticalfinset': return <EllipFin2D key={child.id} comp={child as EllipticalFinSet}
            bodyX={bodyX} bodyLength={bodyL} bodyRadius={bodyR} centerY={centerY} scale={scale}
            stroke={cStroke} strokeWidth={cSW} onClick={clk} childPos={childPos} />;
        case 'freeformfinset': return <FreeformFin2D key={child.id} comp={child as FreeformFinSet}
            bodyX={bodyX} bodyLength={bodyL} bodyRadius={bodyR} centerY={centerY} scale={scale}
            stroke={cStroke} strokeWidth={cSW} onClick={clk} childPos={childPos} />;
        case 'innertube': {
            const it = child as any;
            const itR = it.outerRadius * scale, itL = it.length * scale;
            return (
                <g key={child.id}>
                    <rect x={childX} y={centerY - itR} width={itL} height={itR * 2}
                        fill={cStroke} fillOpacity={0.05} stroke={cStroke} strokeWidth={cSW}
                        strokeDasharray="4,2" onClick={clk} style={{ cursor: 'pointer' }} />
                    {it.children?.map((gc: RocketComponent) => {
                        const gs = gc.id === selectedId;
                        const gStroke = gs ? T.sel : (COMP_COLORS[gc.type] || T.engine);
                        const gPos = ('position' in gc && typeof (gc as any).position === 'number')
                            ? (gc as any).position * scale : 0;
                        if (gc.type === 'engineblock') {
                            const ebL = Math.max((gc as any).length * scale, 2);
                            return <rect key={gc.id} x={childX + gPos} y={centerY - itR * 0.85}
                                width={ebL} height={itR * 1.7} fill={gStroke} fillOpacity={0.12}
                                stroke={gStroke} strokeWidth={gs ? 1.4 : 0.7}
                                onClick={() => onSelect(gc.id)} style={{ cursor: 'pointer' }} />;
                        }
                        if (gc.type === 'centeringring') {
                            const crL = Math.max((gc as any).length * scale, 1.5);
                            return <rect key={gc.id} x={childX + gPos} y={centerY - bodyR * 0.95}
                                width={crL} height={bodyR * 1.9} fill={gStroke} fillOpacity={0.1}
                                stroke={gStroke} strokeWidth={gs ? 1.2 : 0.6}
                                onClick={() => onSelect(gc.id)} style={{ cursor: 'pointer' }} />;
                        }
                        return null;
                    })}
                </g>
            );
        }
        case 'parachute': {
            const pw = Math.min(bodyR * 1.2, bodyL * 0.08);
            const ph = bodyR * 0.5;
            return (
                <g key={child.id} onClick={clk} style={{ cursor: 'pointer' }}>
                    <rect x={childX} y={centerY - ph} width={pw} height={ph * 2}
                        fill={cStroke} fillOpacity={0.1} stroke={cStroke} strokeWidth={cSW}
                        strokeDasharray="3,2" rx={2} />
                    <path d={`M ${childX + pw * 0.15},${centerY + ph * 0.1} Q ${childX + pw * 0.5},${centerY - ph * 0.7} ${childX + pw * 0.85},${centerY + ph * 0.1}`}
                        fill="none" stroke={cStroke} strokeWidth={0.6} opacity={0.5} />
                    {cSel && <CLabel x={childX + pw / 2} y={centerY - bodyR - 18}
                        name={child.name} color={cStroke} mass={getCompMass(child)} />}
                </g>
            );
        }
        case 'streamer': {
            const sw2 = Math.min(bodyR * 2, bodyL * 0.2);
            return (
                <g key={child.id} onClick={clk} style={{ cursor: 'pointer' }}>
                    <rect x={childX} y={centerY - bodyR * 0.35} width={sw2} height={bodyR * 0.7}
                        fill={cStroke} fillOpacity={0.08} stroke={cStroke} strokeWidth={cSW}
                        strokeDasharray="5,2" rx={1} />
                </g>
            );
        }
        case 'launchlug': {
            const lugL = (child as any).length * scale, lugR = (child as any).outerRadius * scale;
            return <rect key={child.id} x={childX} y={centerY - bodyR - lugR * 3}
                width={lugL} height={lugR * 3} fill={cStroke} fillOpacity={0.1}
                stroke={cStroke} strokeWidth={cSW} onClick={clk} style={{ cursor: 'pointer' }} />;
        }
        case 'shockcord': {
            const scLen = bodyL * 0.12;
            const segs = 6, amp = bodyR * 0.15;
            let d = `M ${childX} ${centerY}`;
            for (let i = 1; i <= segs; i++) {
                const sx = childX + (i / segs) * scLen;
                const sy = centerY + (i % 2 === 0 ? -amp : amp);
                d += ` L ${sx} ${sy}`;
            }
            return <path key={child.id} d={d} fill="none" stroke={cStroke} strokeWidth={1.0}
                onClick={clk} style={{ cursor: 'pointer' }} />;
        }
        case 'engineblock': {
            const ebL = Math.max((child as any).length * scale, 2);
            return <rect key={child.id} x={childX} y={centerY - bodyR * 0.85}
                width={ebL} height={bodyR * 1.7} fill={cStroke} fillOpacity={0.1}
                stroke={cStroke} strokeWidth={cSW} strokeDasharray="3,1.5"
                onClick={clk} style={{ cursor: 'pointer' }} />;
        }
        case 'centeringring': {
            const crL = Math.max((child as any).length * scale, 1.5);
            const crIR = (child as any).innerRadius * scale;
            return (
                <g key={child.id} onClick={clk} style={{ cursor: 'pointer' }}>
                    <rect x={childX} y={centerY - bodyR * 0.95} width={crL} height={bodyR * 1.9}
                        fill={cStroke} fillOpacity={0.08} stroke={cStroke} strokeWidth={cSW}
                        strokeDasharray="3,1.5" />
                    {crIR > 0 && <rect x={childX} y={centerY - crIR} width={crL}
                        height={crIR * 2} fill={T.bg} stroke="none" />}
                </g>
            );
        }
        case 'bulkhead': {
            const bhL = Math.max((child as any).length * scale, 2);
            return <rect key={child.id} x={childX} y={centerY - bodyR * 0.95}
                width={bhL} height={bodyR * 1.9} fill={cStroke} fillOpacity={0.18}
                stroke={cStroke} strokeWidth={cSW} onClick={clk} style={{ cursor: 'pointer' }} />;
        }
        case 'tubecoupler': {
            const tcL = (child as any).length * scale, tcR = (child as any).outerRadius * scale;
            return <rect key={child.id} x={childX} y={centerY - tcR} width={tcL}
                height={tcR * 2} fill={cStroke} fillOpacity={0.08} stroke={cStroke}
                strokeWidth={cSW} strokeDasharray="5,2" onClick={clk} style={{ cursor: 'pointer' }} />;
        }
        case 'massobject': {
            const moR = Math.max((child as any).radius * scale, bodyR * 0.25);
            const moL = Math.max((child as any).length * scale, bodyL * 0.02);
            return (
                <g key={child.id} onClick={clk} style={{ cursor: 'pointer' }}>
                    <rect x={childX} y={centerY - moR} width={moL} height={moR * 2}
                        fill={cStroke} fillOpacity={0.08} stroke={cStroke} strokeWidth={cSW}
                        strokeDasharray="3,2" rx={2} />
                    <CLabel x={childX + moL / 2} y={centerY - bodyR - 14}
                        name={child.name} color={cStroke} mass={getCompMass(child)} />
                </g>
            );
        }
        case 'airbrakes': {
            const ab = child as Airbrakes;
            const bladeH = ab.bladeHeight * scale;
            const bladeW = ab.bladeWidth * scale;
            const abX = childX + bladeW * 0.5;
            // Render blade shapes extending from the body tube surface (top and bottom)
            // Show blades at ~45° angle to indicate they are deployable
            const deployAngle = (ab.maxDeployAngle * Math.PI) / 180 * 0.6; // visual hint at 60% of max
            const tipDx = Math.cos(deployAngle) * bladeW;
            const tipDy = Math.sin(deployAngle) * bladeH;
            return (
                <g key={child.id} onClick={clk} style={{ cursor: 'pointer' }}>
                    {/* Top blade */}
                    <polygon
                        points={`${abX},${centerY - bodyR} ${abX + tipDx},${centerY - bodyR - tipDy} ${abX + bladeW},${centerY - bodyR - tipDy * 0.7} ${abX + bladeW},${centerY - bodyR}`}
                        fill={cStroke} fillOpacity={0.15} stroke={cStroke} strokeWidth={cSW} />
                    {/* Bottom blade */}
                    <polygon
                        points={`${abX},${centerY + bodyR} ${abX + tipDx},${centerY + bodyR + tipDy} ${abX + bladeW},${centerY + bodyR + tipDy * 0.7} ${abX + bladeW},${centerY + bodyR}`}
                        fill={cStroke} fillOpacity={0.15} stroke={cStroke} strokeWidth={cSW} />
                    {/* Center marker line on body */}
                    <line x1={abX} y1={centerY - bodyR} x2={abX + bladeW} y2={centerY - bodyR}
                        stroke={cStroke} strokeWidth={cSW * 0.6} strokeDasharray="2,1" />
                    <line x1={abX} y1={centerY + bodyR} x2={abX + bladeW} y2={centerY + bodyR}
                        stroke={cStroke} strokeWidth={cSW * 0.6} strokeDasharray="2,1" />
                    {cSel && <CLabel x={abX + bladeW / 2} y={centerY - bodyR - tipDy - 18}
                        name={child.name} color={cStroke} mass={getCompMass(child)} />}
                </g>
            );
        }
    }
    return null;
}

/* ---------- COMPONENT LABEL ---------- */
const CLabel: React.FC<{ x: number; y: number; name: string; color: string; mass?: number }> = (
    { x, y, name, color, mass }
) => (
    <g pointerEvents="none">
        <rect x={x - 28} y={y - 9} width={56} height={13} rx={6} fill={T.bg}
            fillOpacity={0.85} stroke={color} strokeWidth={0.3} strokeOpacity={0.3} />
        <text x={x} y={y} textAnchor="middle" fontSize="7" fill={color} fontFamily={FONT}
            fontWeight="500" opacity={0.85}>{name}</text>
        {mass !== undefined && <text x={x} y={y + 12} textAnchor="middle" fontSize="6"
            fill={T.muted} fontFamily={FONT} opacity={0.6}>{(mass * 1000).toFixed(1)} g</text>}
    </g>
);

/* ---------- TRAPEZOIDAL FINS ---------- */
const TrapFin2D: React.FC<{
    comp: TrapezoidFinSet; bodyX: number; bodyLength: number; bodyRadius: number;
    centerY: number; scale: number; stroke: string; strokeWidth: number;
    onClick: () => void; childPos?: number; sel?: boolean;
}> = ({ comp, bodyX, bodyLength, bodyRadius, centerY, scale, stroke, strokeWidth, onClick, childPos, sel }) => {
    const finX = childPos !== undefined ? bodyX + childPos : bodyX + bodyLength - comp.rootChord * scale;
    const rc = comp.rootChord * scale, tc = comp.tipChord * scale;
    const h = comp.height * scale, sw = comp.sweepLength * scale;
    const fill = sel ? 'rgba(74,158,245,0.06)' : 'none';
    return (
        <g onClick={onClick} style={{ cursor: 'pointer' }} filter={sel ? 'url(#sel-glow)' : undefined}>
            <polygon points={`${finX},${centerY - bodyRadius} ${finX + sw},${centerY - bodyRadius - h} ${finX + sw + tc},${centerY - bodyRadius - h} ${finX + rc},${centerY - bodyRadius}`}
                fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
            <polygon points={`${finX},${centerY + bodyRadius} ${finX + sw},${centerY + bodyRadius + h} ${finX + sw + tc},${centerY + bodyRadius + h} ${finX + rc},${centerY + bodyRadius}`}
                fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
            {comp.finCount >= 4 && <line x1={finX} y1={centerY} x2={finX + sw + tc / 2} y2={centerY}
                stroke={stroke} strokeWidth={comp.thickness * scale * 2} opacity={0.25} />}
        </g>
    );
};

/* ---------- ELLIPTICAL FINS ---------- */
const EllipFin2D: React.FC<{
    comp: EllipticalFinSet; bodyX: number; bodyLength: number; bodyRadius: number;
    centerY: number; scale: number; stroke: string; strokeWidth: number;
    onClick: () => void; childPos?: number;
}> = ({ comp, bodyX, bodyLength, bodyRadius, centerY, scale, stroke, strokeWidth, onClick, childPos }) => {
    const finX = childPos !== undefined ? bodyX + childPos : bodyX + bodyLength - comp.rootChord * scale;
    const rc = comp.rootChord * scale, h = comp.height * scale, cx = finX + rc / 2;
    return (
        <g onClick={onClick} style={{ cursor: 'pointer' }}>
            <ellipse cx={cx} cy={centerY - bodyRadius - h / 2} rx={rc / 2} ry={h / 2}
                fill="none" stroke={stroke} strokeWidth={strokeWidth} />
            <ellipse cx={cx} cy={centerY + bodyRadius + h / 2} rx={rc / 2} ry={h / 2}
                fill="none" stroke={stroke} strokeWidth={strokeWidth} />
        </g>
    );
};

/* ---------- FREEFORM FINS ---------- */
const FreeformFin2D: React.FC<{
    comp: FreeformFinSet; bodyX: number; bodyLength: number; bodyRadius: number;
    centerY: number; scale: number; stroke: string; strokeWidth: number;
    onClick: () => void; childPos?: number;
}> = ({ comp, bodyX, bodyLength, bodyRadius, centerY, scale, stroke, strokeWidth, onClick, childPos }) => {
    const base = childPos !== undefined ? bodyX + childPos : bodyX + bodyLength * 0.6;
    if (comp.points.length < 3) return null;
    const top = comp.points.map(([px, py]) => `${base + px * scale},${centerY - bodyRadius - py * scale}`).join(' ');
    const bot = comp.points.map(([px, py]) => `${base + px * scale},${centerY + bodyRadius + py * scale}`).join(' ');
    return (
        <g onClick={onClick} style={{ cursor: 'pointer' }}>
            <polygon points={top} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
            <polygon points={bot} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </g>
    );
};

/* ---------- MOTOR ---------- */
const Motor2D: React.FC<{
    motor: Motor; motorPosition: number; scale: number; ox: number; centerY: number;
}> = ({ motor, motorPosition, scale, ox, centerY }) => {
    const mLen = (motor.length / 1000) * scale, mR = (motor.diameter / 2 / 1000) * scale;
    const mx = ox + motorPosition * scale;
    return (
        <g>
            <rect x={mx} y={centerY - mR} width={mLen} height={mR * 2}
                fill={T.shock} fillOpacity={0.12} stroke={T.shock} strokeWidth={0.8} rx={1.5} />
            <rect x={mx + 2} y={centerY - mR + 2} width={Math.max(0, mLen - 4)}
                height={Math.max(0, mR * 2 - 4)} fill="#8B4513" fillOpacity={0.1} stroke="none" rx={1} />
            <text x={mx + mLen / 2} y={centerY + mR + 16} textAnchor="middle" fontSize="6"
                fill={T.shock} fontFamily={FONT} fontWeight="600" opacity={0.6}>{motor.designation}</text>
        </g>
    );
};

/* ---------- TRANSITION ---------- */
const Transition2D: React.FC<{
    comp: Transition; x: number; centerY: number; scale: number; sel: boolean; onClick: () => void;
}> = ({ comp, x, centerY, scale, sel, onClick }) => {
    const l = comp.length * scale, r1 = comp.foreRadius * scale, r2 = comp.aftRadius * scale;
    const stroke = sel ? T.sel : T.body;
    return <polygon
        points={`${x},${centerY - r1} ${x + l},${centerY - r2} ${x + l},${centerY + r2} ${x},${centerY + r1}`}
        fill="url(#body-fill)" stroke={stroke} strokeWidth={sel ? 1.6 : 0.9}
        onClick={onClick} style={{ cursor: 'pointer' }}
        filter={sel ? 'url(#sel-glow)' : undefined} />;
};

/* ---------- CG MARKER ---------- */
const CGMarker: React.FC<{ x: number; centerY: number; maxR: number }> = ({ x, centerY, maxR }) => {
    const r = 5, labelY = centerY - maxR - 20;
    return (
        <g>
            <line x1={x} y1={centerY - maxR - 4} x2={x} y2={labelY + 10}
                stroke={T.accent} strokeWidth="0.4" strokeDasharray="3,2" opacity={0.3} />
            <circle cx={x} cy={centerY} r={r} fill="none" stroke={T.accent} strokeWidth={1.1} />
            <path d={`M ${x} ${centerY - r} A ${r} ${r} 0 0 0 ${x} ${centerY + r} Z`}
                fill={T.accent} opacity={0.75} />
            <rect x={x - 10} y={labelY - 9} width={20} height={13} rx={4} fill={T.bg}
                fillOpacity={0.85} stroke={T.accent} strokeWidth={0.3} strokeOpacity={0.4} />
            <text x={x} y={labelY} textAnchor="middle" fontSize="7" fill={T.accent}
                fontWeight="bold" fontFamily={FONT}>CG</text>
        </g>
    );
};

/* ---------- CP MARKER ---------- */
const CPMarker: React.FC<{ x: number; centerY: number; maxR: number }> = ({ x, centerY, maxR }) => {
    const r = 5, labelY = centerY + maxR + 28;
    return (
        <g>
            <line x1={x} y1={centerY + maxR + 4} x2={x} y2={labelY - 8}
                stroke="#cc3333" strokeWidth="0.4" strokeDasharray="3,2" opacity={0.3} />
            <circle cx={x} cy={centerY} r={r} fill="none" stroke="#cc3333" strokeWidth={1.1} />
            <line x1={x - r} y1={centerY} x2={x + r} y2={centerY} stroke="#cc3333" strokeWidth={0.9} />
            <line x1={x} y1={centerY - r} x2={x} y2={centerY + r} stroke="#cc3333" strokeWidth={0.9} />
            <rect x={x - 10} y={labelY - 9} width={20} height={13} rx={4} fill={T.bg}
                fillOpacity={0.85} stroke="#cc3333" strokeWidth={0.3} strokeOpacity={0.4} />
            <text x={x} y={labelY} textAnchor="middle" fontSize="7" fill="#cc3333"
                fontWeight="bold" fontFamily={FONT}>CP</text>
        </g>
    );
};

/* ---------- DIAMETER CALLOUT ---------- */
const DiameterCallout: React.FC<{
    x: number; centerY: number; radius: number; diameterMm: number;
}> = ({ x, centerY, radius, diameterMm }) => {
    const ax = x + 6;
    const label = `\u00D8 ${diameterMm.toFixed(0)} mm`;
    const labelW = label.length * 4.2 + 8;
    return (
        <g>
            <line x1={ax} y1={centerY - radius} x2={ax} y2={centerY + radius}
                stroke={T.muted} strokeWidth={0.4} />
            <polygon points={`${ax},${centerY - radius} ${ax - 2},${centerY - radius + 4} ${ax + 2},${centerY - radius + 4}`} fill={T.muted} />
            <polygon points={`${ax},${centerY + radius} ${ax - 2},${centerY + radius - 4} ${ax + 2},${centerY + radius - 4}`} fill={T.muted} />
            <rect x={ax + 4} y={centerY - 7} width={labelW} height={14} rx={4}
                fill={T.bg} fillOpacity={0.8} stroke={T.dimLine} strokeWidth={0.3} />
            <text x={ax + 4 + labelW / 2} y={centerY + 3} textAnchor="middle" fontSize="6.5"
                fill={T.muted} fontFamily={FONT}>{label}</text>
        </g>
    );
};

/* ---------- LENGTH DIMENSION ---------- */
const LengthDimension: React.FC<{
    x1: number; x2: number; y: number; lengthMm: number; centerY: number; maxR: number;
}> = ({ x1, x2, y, lengthMm, centerY, maxR }) => {
    const midX = (x1 + x2) / 2;
    const label = `${lengthMm.toFixed(0)} mm`;
    const labelW = label.length * 4.5 + 10;
    return (
        <g>
            <line x1={x1} y1={centerY + maxR + 6} x2={x1} y2={y + 3}
                stroke={T.dimLine} strokeWidth={0.35} strokeDasharray="2,2" />
            <line x1={x2} y1={centerY + maxR + 6} x2={x2} y2={y + 3}
                stroke={T.dimLine} strokeWidth={0.35} strokeDasharray="2,2" />
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={T.muted} strokeWidth={0.5} />
            <polygon points={`${x1},${y} ${x1 + 5},${y - 2.5} ${x1 + 5},${y + 2.5}`} fill={T.muted} />
            <polygon points={`${x2},${y} ${x2 - 5},${y - 2.5} ${x2 - 5},${y + 2.5}`} fill={T.muted} />
            <rect x={midX - labelW / 2} y={y - 13} width={labelW} height={14} rx={4}
                fill={T.bg} fillOpacity={0.85} stroke={T.dimLine} strokeWidth={0.3} />
            <text x={midX} y={y - 4} textAnchor="middle" fontSize="7.5" fill={T.muted}
                fontFamily={FONT} fontWeight="500">{label}</text>
        </g>
    );
};

/* ---------- BACK VIEW ---------- */
const BackView: React.FC<{ positions: any[]; rocket: any; maxRadius: number; scale: number }> = (
    { positions, rocket, maxRadius, scale }
) => {
    const padding = 70;
    const viewSize = maxRadius * 2 * scale + padding * 2 + 200;
    const cx = viewSize / 2, cy = viewSize / 2;
    const lastBody = [...positions].reverse().find(
        p => p.component.type === 'bodytube' || p.component.type === 'transition'
    );
    if (!lastBody) return <div className="rocket-view-2d"><p>No body components</p></div>;
    const bodyR = lastBody.radius * scale;
    const fins: TrapezoidFinSet[] = [];
    if (lastBody.component.type === 'bodytube' && lastBody.component.children)
        for (const child of lastBody.component.children)
            if (child.type === 'trapezoidfinset') fins.push(child);

    return (
        <div className="rocket-view-2d">
            <svg width="100%" height="100%" viewBox={`0 0 ${viewSize} ${viewSize}`}
                preserveAspectRatio="xMidYMid meet">
                <rect width="100%" height="100%" fill={T.bg} />
                <circle cx={cx} cy={cy} r={bodyR} fill="none" stroke={T.body} strokeWidth={0.9} />
                {lastBody.component.type === 'bodytube' && lastBody.component.children?.map((child: any) =>
                    child.type === 'innertube'
                        ? <circle key={child.id} cx={cx} cy={cy} r={child.outerRadius * scale}
                            fill="none" stroke={T.inner} strokeWidth={0.7} opacity={0.7} />
                        : null
                )}
                {fins.map(fin => {
                    const els = [];
                    const h = fin.height * scale;
                    for (let i = 0; i < fin.finCount; i++) {
                        const a = (i * 2 * Math.PI) / fin.finCount - Math.PI / 2;
                        els.push(<line key={`${fin.id}-${i}`}
                            x1={cx + bodyR * Math.cos(a)} y1={cy + bodyR * Math.sin(a)}
                            x2={cx + (bodyR + h) * Math.cos(a)} y2={cy + (bodyR + h) * Math.sin(a)}
                            stroke={T.fins} strokeWidth={fin.thickness * scale * 3 + 1.5}
                            strokeLinecap="round" />);
                    }
                    return <g key={fin.id}>{els}</g>;
                })}
                {lastBody.component.type === 'bodytube' && lastBody.component.children?.map((child: any) =>
                    child.type === 'launchlug'
                        ? <circle key={child.id} cx={cx} cy={cy - bodyR - child.outerRadius * scale * 2}
                            r={child.outerRadius * scale * 2} fill="none" stroke={T.body} strokeWidth={0.7} />
                        : null
                )}
                <text x={cx} y={28} textAnchor="middle" fontSize="9" fill={T.gridText}
                    fontFamily={FONT} fontWeight="500" letterSpacing="0.5">Rear View</text>
            </svg>
        </div>
    );
};
