import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { SimulationResult, SimulationDataPoint } from '../types/rocket';

interface FlightAnimationProps {
    result: SimulationResult;
}

/* Colour palette */
const COL = {
    gridMajor: 'rgba(60,80,110,0.25)',
    gridMinor: 'rgba(40,55,75,0.12)',
    gridLabel: 'rgba(150,170,200,0.50)',
    groundLine: '#3a6a22',
    trailGlow: 'rgba(80,160,255,0.08)',
    hudBg: 'rgba(10,16,24,0.82)',
    hudBorder: 'rgba(60,100,160,0.35)',
    hudLabel: 'rgba(120,150,180,0.65)',
    miniPlotLine: 'rgba(100,180,255,0.55)',
    miniPlotFill: 'rgba(60,140,240,0.08)',
    miniPlotCur: '#64b5f6',
    rocketBody: '#c0ccd8',
    rocketNose: '#cc4444',
    rocketFin: '#c07838',
    rocketStripe: 'rgba(0,0,0,0.12)',
    chuteLine: 'rgba(180,180,180,0.45)',
    chuteStroke: 'rgba(180,40,40,0.60)',
    arrowThrust: '#ffb74d',
    arrowDrag: '#ef5350',
    arrowGravity: '#9e9e9e',
    smoke: [180, 190, 200] as number[],
    apogeeMarker: '#64b5f6',
};

const MONO = '10px "JetBrains Mono","Fira Code","SF Mono",Menlo,monospace';
const MONO_SM = '9px "JetBrains Mono","Fira Code","SF Mono",Menlo,monospace';

export const FlightAnimation: React.FC<FlightAnimationProps> = ({ result }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [frameIndex, setFrameIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [showForces, setShowForces] = useState(true);
    const animRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    const accumulatorRef = useRef<number>(0);

    const data = result.data;
    const maxFrame = data.length - 1;
    const dp = data[frameIndex];
    const maxAlt = result.maxAltitude;

    const events = useMemo(() =>
        result.events.map(evt => {
            const idx = data.findIndex(d => d.time >= evt.time);
            return { ...evt, frameIndex: idx >= 0 ? idx : 0 };
        })
        , [result.events, data]);

    const deployedChuteCount = events.filter(e => e.type === 'deployment' && frameIndex >= e.frameIndex).length;
    const isRecoveryDeployed = deployedChuteCount > 0;
    const isBurning = (() => {
        const b = events.find(e => e.type === 'burnout');
        return b ? frameIndex < b.frameIndex : dp.thrustForce > 0;
    })();
    const hasLanded = events.some(e => e.type === 'groundhit' && frameIndex >= e.frameIndex);

    /* Playback loop */
    useEffect(() => {
        if (!playing) return;
        const step = (ts: number) => {
            if (lastTimeRef.current === 0) lastTimeRef.current = ts;
            const elapsed = (ts - lastTimeRef.current) / 1000;
            lastTimeRef.current = ts;
            accumulatorRef.current += elapsed * playbackSpeed;
            const dt = data.length > 1 ? data[1].time - data[0].time : 0.01;
            const adv = Math.floor(accumulatorRef.current / dt);
            if (adv > 0) {
                accumulatorRef.current -= adv * dt;
                setFrameIndex(prev => {
                    const next = Math.min(prev + adv, maxFrame);
                    if (next >= maxFrame) { setPlaying(false); return maxFrame; }
                    return next;
                });
            }
            animRef.current = requestAnimationFrame(step);
        };
        lastTimeRef.current = 0;
        accumulatorRef.current = 0;
        animRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(animRef.current);
    }, [playing, playbackSpeed, maxFrame, data]);

    /* Draw */
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const rect = container.getBoundingClientRect();
        const W = rect.width, H = rect.height;
        canvas.width = W * devicePixelRatio;
        canvas.height = H * devicePixelRatio;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        const ctx = canvas.getContext('2d')!;
        ctx.scale(devicePixelRatio, devicePixelRatio);
        drawScene(ctx, W, H, dp, data, frameIndex, maxAlt, deployedChuteCount, isBurning, hasLanded, events, result, showForces);
    });

    /* Resize */
    useEffect(() => {
        const c = containerRef.current;
        if (!c) return;
        const ro = new ResizeObserver(() => setFrameIndex(f => f));
        ro.observe(c);
        return () => ro.disconnect();
    }, []);

    const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) =>
        setFrameIndex(parseInt(e.target.value, 10)), []);
    const stepFrame = useCallback((d: number) =>
        setFrameIndex(p => Math.max(0, Math.min(maxFrame, p + d))), [maxFrame]);
    const togglePlay = useCallback(() => {
        if (frameIndex >= maxFrame) setFrameIndex(0);
        setPlaying(p => !p);
    }, [frameIndex, maxFrame]);

    /* Keyboard */
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
            switch (e.key) {
                case ' ': e.preventDefault(); togglePlay(); break;
                case 'ArrowRight': e.preventDefault(); setPlaying(false); stepFrame(e.shiftKey ? 10 : 1); break;
                case 'ArrowLeft': e.preventDefault(); setPlaying(false); stepFrame(e.shiftKey ? -10 : -1); break;
                case 'Home': e.preventDefault(); setPlaying(false); setFrameIndex(0); break;
                case 'End': e.preventDefault(); setPlaying(false); setFrameIndex(maxFrame); break;
            }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [togglePlay, stepFrame, maxFrame]);

    const currentEvent = [...events].reverse().find(e => frameIndex >= e.frameIndex);

    return (
        <div className="flight-animation">
            <div className="fa-canvas-wrap" ref={containerRef}>
                <canvas ref={canvasRef} />
            </div>
            <div className="fa-controls">
                <div className="fa-transport">
                    <button className="fa-btn" onClick={() => { setPlaying(false); setFrameIndex(0); }} title="Reset">\u23EE</button>
                    <button className="fa-btn" onClick={() => { setPlaying(false); stepFrame(-10); }} title="-10">\u23EA</button>
                    <button className="fa-btn" onClick={() => { setPlaying(false); stepFrame(-1); }} title="-1">\u25C0</button>
                    <button className="fa-btn fa-play-btn" onClick={togglePlay}>{playing ? '\u23F8' : '\u25B6'}</button>
                    <button className="fa-btn" onClick={() => { setPlaying(false); stepFrame(1); }} title="+1">\u25B6</button>
                    <button className="fa-btn" onClick={() => { setPlaying(false); stepFrame(10); }} title="+10">\u23E9</button>
                    <button className="fa-btn" onClick={() => { setPlaying(false); setFrameIndex(maxFrame); }} title="End">\u23ED</button>
                    <span className="fa-sep" />
                    <button className={"fa-btn fa-toggle" + (showForces ? " active" : "")}
                        onClick={() => setShowForces(f => !f)} title="Toggle force vectors">\u21D5 Forces</button>
                </div>
                <div className="fa-scrubber">
                    <input type="range" min={0} max={maxFrame} value={frameIndex} onChange={handleScrub} className="fa-range" />
                    <div className="fa-event-markers">
                        {events.map((evt, i) => (
                            <div key={i} className={"fa-event-dot fa-evt-" + evt.type}
                                style={{ left: (evt.frameIndex / maxFrame) * 100 + '%' }}
                                title={evt.description + ' (t=' + evt.time.toFixed(2) + 's)'} />
                        ))}
                    </div>
                </div>
                <div className="fa-info-bar">
                    <div className="fa-speed">
                        <label>Speed:</label>
                        <select value={playbackSpeed} onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}>
                            {[0.1, 0.25, 0.5, 1, 2, 5, 10].map(s =>
                                <option key={s} value={s}>{s}\u00D7</option>)}
                        </select>
                    </div>
                    <div className="fa-telemetry">
                        <span className="fa-tel-item"><b>t</b> {dp.time.toFixed(2)}s</span>
                        <span className="fa-tel-item"><b>Alt</b> {dp.altitude.toFixed(1)}m</span>
                        <span className="fa-tel-item"><b>V</b> {dp.velocity.toFixed(1)}m/s</span>
                        <span className="fa-tel-item"><b>Vy</b> {dp.velocityY >= 0 ? '+' : ''}{dp.velocityY.toFixed(1)}m/s</span>
                        <span className="fa-tel-item"><b>Thr</b> {dp.thrustForce.toFixed(1)}N</span>
                        <span className="fa-tel-item"><b>Drag</b> {dp.dragForce.toFixed(2)}N</span>
                        <span className="fa-tel-item"><b>Mass</b> {(dp.totalMass * 1000).toFixed(0)}g</span>
                        <span className="fa-tel-item"><b>Mach</b> {dp.machNumber.toFixed(3)}</span>
                    </div>
                    {currentEvent && (
                        <div className={"fa-phase fa-phase-" + currentEvent.type}>
                            {currentEvent.type === 'launch' && '\uD83D\uDE80 Powered Ascent'}
                            {currentEvent.type === 'launchrod' && '\uD83D\uDE80 Powered Flight'}
                            {currentEvent.type === 'burnout' && '\u25CC Coast Phase'}
                            {currentEvent.type === 'apogee' && (isRecoveryDeployed ? '\uD83E\uDE82 Recovery Descent' : '\u2193 Descent')}
                            {currentEvent.type === 'deployment' && '\uD83E\uDE82 Recovery Descent'}
                            {currentEvent.type === 'groundhit' && '\u2713 Landed'}
                        </div>
                    )}
                </div>
                <div className="fa-kbd-hint">Space play/pause \u00B7 \u2190\u2192 step \u00B7 Shift+\u2190\u2192 \u00D710 \u00B7 Home/End jump</div>
            </div>
        </div>
    );
};

/* ================================================================
   DRAW
   ================================================================ */

function drawScene(
    ctx: CanvasRenderingContext2D, W: number, H: number,
    dp: SimulationDataPoint, data: SimulationDataPoint[], frameIndex: number,
    maxAlt: number, chuteCount: number, burning: boolean, landed: boolean,
    events: Array<{ type: string; frameIndex: number; time: number; description: string }>,
    _result: SimulationResult, showForces: boolean,
) {
    const alt = dp.altitude;
    const ML = 48, MR = 52, MT = 16;
    const groundFrac = 0.14;
    const skyH = H * (1 - groundFrac);
    const groundY = skyH;
    const viewMaxAlt = Math.max(maxAlt * 1.15, 20);
    const altToY = (a: number) => groundY - ((a / viewMaxAlt) * (skyH - MT - 8));

    const centerX = ML + (W - ML - MR) / 2;
    const maxLateral = Math.max(...data.slice(0, frameIndex + 1).map(d => Math.abs(d.positionX)), 0.5);
    const lateralScale = Math.min((W - ML - MR) * 0.4 / maxLateral, 300);

    ctx.clearRect(0, 0, W, H);

    /* Sky */
    const skyGrad = ctx.createLinearGradient(0, 0, 0, skyH);
    const af = Math.min(alt / Math.max(maxAlt, 50), 1);
    skyGrad.addColorStop(0, lerpColor('#111825', '#060a12', af));
    skyGrad.addColorStop(1, lerpColor('#1a2540', '#0e1520', af));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, skyH);

    if (af > 0.25) {
        const sa = Math.min((af - 0.25) / 0.5, 0.7);
        ctx.fillStyle = 'rgba(255,255,255,' + sa + ')';
        for (let i = 0; i < 30; i++) {
            const sx = seededRand(i * 7 + 3) * W;
            const sy = seededRand(i * 13 + 1) * skyH * 0.55;
            ctx.beginPath();
            ctx.arc(sx, sy, 0.5 + seededRand(i * 11) * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawGrid(ctx, W, groundY, viewMaxAlt, altToY, ML, MR);

    /* Ground */
    const gGrad = ctx.createLinearGradient(0, groundY, 0, H);
    gGrad.addColorStop(0, '#253a14');
    gGrad.addColorStop(0.15, '#1e3210');
    gGrad.addColorStop(1, '#14250a');
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = COL.groundLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

    /* Distance markings */
    ctx.font = MONO_SM;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(100,160,80,0.35)';
    const distStep = niceStep(maxLateral * 2, 6);
    for (let d = -maxLateral * 2; d <= maxLateral * 2; d += Math.max(distStep, 0.5)) {
        const gx = centerX + d * lateralScale;
        if (gx < ML || gx > W - MR) continue;
        ctx.fillText(d.toFixed(0) + 'm', gx, groundY + 14);
        ctx.strokeStyle = 'rgba(80,130,60,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(gx, groundY); ctx.lineTo(gx, groundY + 4); ctx.stroke();
    }

    drawSmoke(ctx, data, frameIndex, centerX, lateralScale, altToY);
    drawFlightTrail(ctx, data, frameIndex, centerX, lateralScale, altToY, events);

    /* Apogee marker */
    const apogeeEvt = events.find(e => e.type === 'apogee');
    if (apogeeEvt && frameIndex >= apogeeEvt.frameIndex) {
        const apd = data[apogeeEvt.frameIndex];
        const ax = centerX + apd.positionX * lateralScale;
        const ay = altToY(apd.altitude);
        ctx.strokeStyle = COL.apogeeMarker; ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(ax - 14, ay); ctx.lineTo(ax + 14, ay); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = MONO_SM; ctx.textAlign = 'center'; ctx.fillStyle = COL.apogeeMarker;
        ctx.fillText('\u25B2 ' + apd.altitude.toFixed(0) + 'm', ax, ay - 8);
    }

    /* Rocket */
    const rocketX = centerX + dp.positionX * lateralScale;
    const rocketY = altToY(alt);
    const rLen = Math.max(16, Math.min(36, skyH * 0.04));
    const rW = rLen * 0.18;
    let angle = -Math.PI / 2;
    if (dp.velocity > 0.5 && !landed) angle = Math.atan2(-dp.velocityY, dp.velocityX * (lateralScale / 80));
    if (landed) angle = -Math.PI / 2;

    ctx.save();
    ctx.translate(rocketX, rocketY);
    if (chuteCount <= 0 || landed) drawRocket(ctx, rLen, rW, angle, burning, dp);
    else drawParachute(ctx, rLen, rW, dp, chuteCount);
    if (showForces && !landed) drawForceVectors(ctx, dp, rLen, burning);
    ctx.restore();

    drawLaunchPad(ctx, centerX, groundY);
    drawAltBar(ctx, W, MR, MT, groundY, alt, viewMaxAlt);
    drawHUD(ctx, dp, burning);
    drawMiniPlot(ctx, data, frameIndex, W, groundY, MR);
}

/* ---- Grid ---- */
function drawGrid(ctx: CanvasRenderingContext2D, W: number, groundY: number,
    viewMaxAlt: number, altToY: (a: number) => number, ML: number, MR: number) {
    const major = niceStep(viewMaxAlt, 5);
    const minor = major / 5;
    ctx.strokeStyle = COL.gridMinor; ctx.lineWidth = 0.5;
    for (let a = 0; a <= viewMaxAlt; a += minor) {
        const y = altToY(a); if (y < 8 || y > groundY) continue;
        ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(W - MR, y); ctx.stroke();
    }
    ctx.font = MONO_SM; ctx.textAlign = 'right';
    for (let a = 0; a <= viewMaxAlt; a += major) {
        const y = altToY(a); if (y < 8 || y > groundY) continue;
        ctx.strokeStyle = COL.gridMajor; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(W - MR, y); ctx.stroke();
        ctx.fillStyle = COL.gridLabel;
        ctx.fillText(a.toFixed(0) + ' m', ML - 4, y + 3);
    }
    ctx.strokeStyle = COL.gridMajor; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ML, altToY(0)); ctx.lineTo(ML, altToY(viewMaxAlt)); ctx.stroke();
}

/* ---- Flight trail ---- */
function drawFlightTrail(ctx: CanvasRenderingContext2D, data: SimulationDataPoint[], frameIndex: number,
    cx: number, latScale: number, altToY: (a: number) => number,
    events: Array<{ type: string; frameIndex: number }>) {
    if (frameIndex < 1) return;
    const trailStart = Math.max(0, frameIndex - 600);
    ctx.strokeStyle = COL.trailGlow; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = trailStart; i <= frameIndex; i++) {
        const d = data[i]; const px = cx + d.positionX * latScale; const py = altToY(d.altitude);
        if (i === trailStart) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    const burnoutIdx = events.find(e => e.type === 'burnout')?.frameIndex ?? Infinity;
    const deployIdx = events.find(e => e.type === 'deployment')?.frameIndex ?? Infinity;
    for (let i = trailStart + 1; i <= frameIndex; i++) {
        const d0 = data[i - 1], d1 = data[i];
        let col: string;
        if (i < burnoutIdx) col = 'rgba(255,180,80,0.50)';
        else if (i < deployIdx) col = 'rgba(100,180,255,0.40)';
        else col = 'rgba(240,100,100,0.40)';
        ctx.strokeStyle = col; ctx.beginPath();
        ctx.moveTo(cx + d0.positionX * latScale, altToY(d0.altitude));
        ctx.lineTo(cx + d1.positionX * latScale, altToY(d1.altitude));
        ctx.stroke();
    }
}

/* ---- Smoke ---- */
function drawSmoke(ctx: CanvasRenderingContext2D, data: SimulationDataPoint[], frameIndex: number,
    cx: number, latScale: number, altToY: (a: number) => number) {
    const SMOKE_LIFE = 120;
    const start = Math.max(0, frameIndex - SMOKE_LIFE);
    for (let i = start; i < frameIndex; i++) {
        const d = data[i]; if (d.thrustForce < 0.05) continue;
        const age = (frameIndex - i) / SMOKE_LIFE;
        const alpha = Math.max(0, 0.18 * (1 - age));
        const size = 1.5 + age * 10;
        const drift = age * 6;
        const jx = seededRand(i * 3 + 7) * 4 - 2;
        const jy = seededRand(i * 5 + 3) * 2;
        const sx = cx + d.positionX * latScale + jx * age * 3;
        const sy = altToY(d.altitude) + drift + jy;
        const c = COL.smoke;
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
    }
}

/* ---- Rocket ---- */
function drawRocket(ctx: CanvasRenderingContext2D, rLen: number, rW: number, angle: number,
    burning: boolean, dp: SimulationDataPoint) {
    ctx.rotate(angle + Math.PI / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.roundRect(-rW - 0.5, -rLen / 2 + 0.5, rW * 2 + 1, rLen + 0.5, 2); ctx.fill();

    const bodyGrad = ctx.createLinearGradient(-rW, 0, rW, 0);
    bodyGrad.addColorStop(0, '#8898a8'); bodyGrad.addColorStop(0.3, COL.rocketBody);
    bodyGrad.addColorStop(0.7, COL.rocketBody); bodyGrad.addColorStop(1, '#98a8b8');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.roundRect(-rW, -rLen / 2, rW * 2, rLen, 1.5); ctx.fill();

    ctx.fillStyle = COL.rocketStripe;
    ctx.fillRect(-rW, -rLen * 0.08, rW * 2, rLen * 0.05);
    ctx.fillRect(-rW, rLen * 0.08, rW * 2, rLen * 0.05);

    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.roundRect(-rW, -rLen / 2, rW * 2, rLen, 1.5); ctx.stroke();

    const noseLen = rLen * 0.32;
    const noseGrad = ctx.createLinearGradient(-rW, 0, rW, 0);
    noseGrad.addColorStop(0, '#a03030'); noseGrad.addColorStop(0.4, COL.rocketNose); noseGrad.addColorStop(1, '#b03838');
    ctx.fillStyle = noseGrad;
    ctx.beginPath();
    ctx.moveTo(0, -rLen / 2 - noseLen);
    ctx.bezierCurveTo(-rW * 0.3, -rLen / 2 - noseLen * 0.4, -rW, -rLen / 2 - 1, -rW, -rLen / 2);
    ctx.lineTo(rW, -rLen / 2);
    ctx.bezierCurveTo(rW, -rLen / 2 - 1, rW * 0.3, -rLen / 2 - noseLen * 0.4, 0, -rLen / 2 - noseLen);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5; ctx.stroke();

    const finH = rLen * 0.30, finW = rLen * 0.20;
    const finGrad = ctx.createLinearGradient(-rW - finW, 0, -rW, 0);
    finGrad.addColorStop(0, '#a06028'); finGrad.addColorStop(1, COL.rocketFin);
    for (const side of [-1, 1]) {
        ctx.fillStyle = finGrad; ctx.beginPath();
        ctx.moveTo(side * rW, rLen / 2);
        ctx.lineTo(side * (rW + finW), rLen / 2 + 2);
        ctx.lineTo(side * (rW + finW * 0.45), rLen / 2 - finH);
        ctx.lineTo(side * rW, rLen / 2 - finH * 0.55);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.4; ctx.stroke();
    }

    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.roundRect(-rW * 0.6, rLen / 2 - 1, rW * 1.2, 3, 0.5); ctx.fill();

    if (burning && dp.thrustForce > 0.1) drawExhaust(ctx, rLen, rW, dp);
}

/* ---- Exhaust ---- */
function drawExhaust(ctx: CanvasRenderingContext2D, rLen: number, rW: number, dp: SimulationDataPoint) {
    const intensity = Math.min(dp.thrustForce / 18, 1);
    const flameLen = rLen * (0.5 + intensity * 1.0);
    const fw = rW * (0.6 + intensity * 0.5);
    const flicker = 1 + Math.sin(dp.time * 90) * 0.12 + Math.sin(dp.time * 143) * 0.08;
    const fl = flameLen * flicker;

    const outerG = ctx.createLinearGradient(0, rLen / 2, 0, rLen / 2 + fl);
    outerG.addColorStop(0, 'rgba(255,210,80,0.92)'); outerG.addColorStop(0.25, 'rgba(255,140,30,0.75)');
    outerG.addColorStop(0.6, 'rgba(255,60,15,0.35)'); outerG.addColorStop(1, 'rgba(180,20,0,0)');
    ctx.fillStyle = outerG; ctx.beginPath();
    ctx.moveTo(-fw, rLen / 2 + 1);
    ctx.bezierCurveTo(-fw * 0.6, rLen / 2 + fl * 0.35, -fw * 0.15, rLen / 2 + fl * 0.7, 0, rLen / 2 + fl);
    ctx.bezierCurveTo(fw * 0.15, rLen / 2 + fl * 0.7, fw * 0.6, rLen / 2 + fl * 0.35, fw, rLen / 2 + 1);
    ctx.closePath(); ctx.fill();

    const coreL = fl * 0.45;
    const coreG = ctx.createLinearGradient(0, rLen / 2, 0, rLen / 2 + coreL);
    coreG.addColorStop(0, 'rgba(255,255,230,0.95)'); coreG.addColorStop(0.5, 'rgba(255,230,130,0.55)');
    coreG.addColorStop(1, 'rgba(255,170,50,0)');
    ctx.fillStyle = coreG; ctx.beginPath();
    ctx.moveTo(-fw * 0.3, rLen / 2 + 1);
    ctx.quadraticCurveTo(0, rLen / 2 + coreL * 0.75, 0, rLen / 2 + coreL);
    ctx.quadraticCurveTo(0, rLen / 2 + coreL * 0.75, fw * 0.3, rLen / 2 + 1);
    ctx.closePath(); ctx.fill();

    ctx.save();
    ctx.shadowColor = 'rgba(255,160,40,' + (0.5 * intensity).toFixed(2) + ')';
    ctx.shadowBlur = 18 * intensity;
    ctx.fillStyle = 'rgba(255,200,60,0.06)';
    ctx.beginPath(); ctx.arc(0, rLen / 2, rW * 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

/* ---- Parachute(s) ---- */
const CHUTE_COLOURS = [
    { c0: 'rgba(240,70,70,0.82)', c1: 'rgba(200,50,50,0.72)', c2: 'rgba(160,30,30,0.55)', stroke: 'rgba(180,40,40,0.60)' },
    { c0: 'rgba(70,150,240,0.82)', c1: 'rgba(50,120,200,0.72)', c2: 'rgba(30,80,160,0.55)', stroke: 'rgba(40,100,180,0.60)' },
    { c0: 'rgba(70,200,100,0.82)', c1: 'rgba(50,170,70,0.72)', c2: 'rgba(30,130,50,0.55)', stroke: 'rgba(40,150,60,0.60)' },
    { c0: 'rgba(230,180,50,0.82)', c1: 'rgba(200,150,40,0.72)', c2: 'rgba(170,120,30,0.55)', stroke: 'rgba(190,140,40,0.60)' },
];

function drawParachute(ctx: CanvasRenderingContext2D, rLen: number, rW: number, dp: SimulationDataPoint, chuteCount: number) {
    const count = Math.max(1, chuteCount);
    const nCords = 8;

    /* layout: first chute=drogue (smaller), subsequent=main (bigger) when >1 */
    const chutes: Array<{ radius: number; cordLen: number; offsetX: number; col: typeof CHUTE_COLOURS[0]; swayPhase: number }> = [];
    if (count === 1) {
        chutes.push({ radius: rLen * 1.8, cordLen: rLen * 2.0, offsetX: 0, col: CHUTE_COLOURS[0], swayPhase: 0 });
    } else {
        /* First deploy = drogue (smaller), later deploys = main (bigger), spread horizontally */
        const totalSpan = rLen * 2.5 * (count - 1);
        for (let i = 0; i < count; i++) {
            const isDrogue = i === 0;
            const r = isDrogue ? rLen * 1.0 : rLen * 1.8;
            const cL = isDrogue ? rLen * 1.4 : rLen * 2.2;
            const ox = count <= 1 ? 0 : -totalSpan / 2 + i * totalSpan / (count - 1);
            chutes.push({ radius: r, cordLen: cL, offsetX: ox, col: CHUTE_COLOURS[i % CHUTE_COLOURS.length], swayPhase: i * 1.1 });
        }
    }

    for (const ch of chutes) {
        const sway = Math.sin(dp.time * 1.3 + ch.swayPhase) * 5;
        const breathe = 1 + Math.sin(dp.time * 2.5 + ch.swayPhase * 0.7) * 0.04;
        const cR = ch.radius;
        const cL = ch.cordLen;
        const ox = ch.offsetX;

        /* Cord lines from rocket body to canopy */
        ctx.strokeStyle = COL.chuteLine; ctx.lineWidth = 0.6;
        for (let i = 0; i < nCords; i++) {
            const a = Math.PI + (i / (nCords - 1)) * Math.PI;
            ctx.beginPath(); ctx.moveTo(0, 2);
            ctx.bezierCurveTo(
                ox * 0.3 + sway * 0.3, -cL * 0.4,
                ox * 0.7 + sway * 0.7 + Math.cos(a) * cR * breathe * 0.3, -cL * 0.7,
                ox + sway + Math.cos(a) * cR * breathe, -cL + Math.sin(a) * cR * breathe * 0.15);
            ctx.stroke();
        }

        /* Canopy */
        ctx.save(); ctx.translate(ox + sway, -cL);
        const canopyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, cR * breathe);
        canopyGrad.addColorStop(0, ch.col.c0); canopyGrad.addColorStop(0.7, ch.col.c1);
        canopyGrad.addColorStop(1, ch.col.c2);
        ctx.fillStyle = canopyGrad;
        ctx.beginPath(); ctx.ellipse(0, 0, cR * breathe, cR * breathe * 0.45, 0, Math.PI, 0, false); ctx.fill();
        ctx.strokeStyle = ch.col.stroke; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(0, 0, cR * breathe, cR * breathe * 0.45, 0, Math.PI, 0, false); ctx.stroke();

        /* Canopy ribs */
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 0.4;
        for (let i = 1; i < nCords - 1; i++) {
            const a = Math.PI + (i / (nCords - 1)) * Math.PI;
            ctx.beginPath(); ctx.moveTo(0, 2);
            ctx.lineTo(Math.cos(a) * cR * breathe, Math.sin(a) * cR * breathe * 0.45); ctx.stroke();
        }

        /* Canopy highlight arc */
        ctx.strokeStyle = 'rgba(255,200,200,0.12)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, -cR * 0.08, cR * 0.5, cR * 0.12, 0, Math.PI * 1.1, Math.PI * 1.9, false); ctx.stroke();
        ctx.restore();
    }

    /* Dangling rocket body (always one) */
    const mLen = rLen * 0.45, mW = rW * 0.65;
    const bodyG = ctx.createLinearGradient(-mW, 0, mW, 0);
    bodyG.addColorStop(0, '#8898a8'); bodyG.addColorStop(0.5, '#b0c0d0'); bodyG.addColorStop(1, '#90a0b0');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.roundRect(-mW, -mLen / 2 + 3, mW * 2, mLen, 1); ctx.fill();
    ctx.fillStyle = COL.rocketNose;
    ctx.beginPath(); ctx.moveTo(0, -mLen / 2 + 3 - mLen * 0.2); ctx.lineTo(-mW, -mLen / 2 + 3); ctx.lineTo(mW, -mLen / 2 + 3);
    ctx.closePath(); ctx.fill();
}

/* ---- Force vectors ---- */
function drawForceVectors(ctx: CanvasRenderingContext2D, dp: SimulationDataPoint, rLen: number, burning: boolean) {
    const maxF = Math.max(dp.thrustForce, dp.dragForce, dp.gravityForce, 1);
    const scale = (rLen * 2.5) / maxF;
    const minLen = 6;
    if (burning && dp.thrustForce > 0.1) {
        const len = Math.max(dp.thrustForce * scale, minLen);
        drawArrow(ctx, 0, 0, 0, -len, COL.arrowThrust, 'T');
    }
    if (dp.dragForce > 0.01 && dp.velocity > 0.1) {
        const len = Math.max(dp.dragForce * scale, minLen);
        const vx = dp.velocityX, vy = dp.velocityY;
        const spd = Math.sqrt(vx * vx + vy * vy) || 1;
        drawArrow(ctx, 0, 0, (vx / spd) * -len * 0.4, (vy / spd) * len * 0.4, COL.arrowDrag, 'D');
    }
    {
        const len = Math.max(dp.gravityForce * scale, minLen);
        drawArrow(ctx, rLen * 0.7, 0, rLen * 0.7, len, COL.arrowGravity, 'W');
    }
}

function drawArrow(ctx: CanvasRenderingContext2D, x0: number, y0: number,
    x1: number, y1: number, color: string, label: string) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 3) return;
    const ux = dx / len, uy = dy / len;
    const headLen = Math.min(6, len * 0.3);
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * headLen - uy * headLen * 0.4, y1 - uy * headLen + ux * headLen * 0.4);
    ctx.lineTo(x1 - ux * headLen + uy * headLen * 0.4, y1 - uy * headLen - ux * headLen * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = color;
    ctx.fillText(label, (x0 + x1) / 2 + uy * 8, (y0 + y1) / 2 - ux * 8);
}

/* ---- Launch pad ---- */
function drawLaunchPad(ctx: CanvasRenderingContext2D, cx: number, gy: number) {
    ctx.strokeStyle = '#6a6a6a'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx, gy - 22); ctx.stroke();
    ctx.fillStyle = '#444'; ctx.beginPath();
    ctx.moveTo(cx - 10, gy); ctx.lineTo(cx + 10, gy); ctx.lineTo(cx + 8, gy - 3); ctx.lineTo(cx - 8, gy - 3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 3, gy - 3); ctx.lineTo(cx - 12, gy);
    ctx.moveTo(cx + 3, gy - 3); ctx.lineTo(cx + 12, gy); ctx.stroke();
}

/* ---- Altitude bar ---- */
function drawAltBar(ctx: CanvasRenderingContext2D, W: number, MR: number, MT: number,
    groundY: number, alt: number, viewMaxAlt: number) {
    const bx = W - MR + 14, bw = 10, bt = MT + 4, bb = groundY - 8, bh = bb - bt;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath(); ctx.roundRect(bx, bt, bw, bh, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.roundRect(bx, bt, bw, bh, 3); ctx.stroke();
    const frac = Math.min(alt / viewMaxAlt, 1), fh = frac * bh;
    const barG = ctx.createLinearGradient(0, bb, 0, bb - fh);
    barG.addColorStop(0, 'rgba(33,150,243,0.6)'); barG.addColorStop(1, 'rgba(100,181,246,0.8)');
    ctx.fillStyle = barG;
    ctx.beginPath(); ctx.roundRect(bx + 1, bb - fh, bw - 2, fh, 2); ctx.fill();
    const my = bb - fh;
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.moveTo(bx - 2, my); ctx.lineTo(bx + 1, my - 3); ctx.lineTo(bx + 1, my + 3); ctx.closePath(); ctx.fill();
    ctx.font = MONO_SM; ctx.textAlign = 'center'; ctx.fillStyle = COL.miniPlotCur;
    ctx.fillText(alt.toFixed(0) + '', bx + bw / 2, Math.max(my - 6, bt + 8));
}

/* ---- HUD ---- */
function drawHUD(ctx: CanvasRenderingContext2D, dp: SimulationDataPoint, burning: boolean) {
    const x = 54, y = 18, w = 155, h = burning ? 80 : 68;
    ctx.fillStyle = COL.hudBg;
    ctx.beginPath(); ctx.roundRect(x - 6, y - 4, w, h, 4); ctx.fill();
    ctx.strokeStyle = COL.hudBorder; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.roundRect(x - 6, y - 4, w, h, 4); ctx.stroke();
    ctx.font = '8px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = COL.hudLabel;
    ctx.fillText('FLIGHT TELEMETRY', x, y + 6);
    ctx.strokeStyle = COL.hudBorder; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x + w - 12, y + 10); ctx.stroke();

    let ly = y + 22;
    const row = (label: string, value: string, color: string) => {
        ctx.font = MONO_SM; ctx.fillStyle = COL.hudLabel; ctx.textAlign = 'left'; ctx.fillText(label, x, ly);
        ctx.font = MONO; ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.fillText(value, x + w - 14, ly);
        ctx.textAlign = 'left'; ly += 13;
    };
    row('ALT', dp.altitude.toFixed(1) + ' m', '#64b5f6');
    row('VEL', dp.velocity.toFixed(1) + ' m/s', '#81c784');
    row('Vy', (dp.velocityY >= 0 ? '+' : '') + dp.velocityY.toFixed(1) + ' m/s', dp.velocityY >= 0 ? '#81c784' : '#ef5350');
    if (burning) row('THR', dp.thrustForce.toFixed(1) + ' N', '#ffb74d');
    row('t', dp.time.toFixed(2) + ' s', 'rgba(200,210,220,0.6)');
}

/* ---- Mini plot ---- */
function drawMiniPlot(ctx: CanvasRenderingContext2D, data: SimulationDataPoint[], frameIndex: number,
    W: number, groundY: number, MR: number) {
    const pw = 140, ph = 55, px = W - MR - pw - 4, py = groundY - ph - 8;
    ctx.fillStyle = 'rgba(10,16,24,0.70)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(60,100,160,0.25)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 3); ctx.stroke();
    ctx.font = '7px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(120,150,180,0.5)';
    ctx.fillText('ALT vs TIME', px + 4, py + 8);

    const plotL = px + 4, plotR = px + pw - 4, plotT = py + 12, plotB = py + ph - 4;
    const plotW = plotR - plotL, plotH = plotB - plotT;
    const maxT = data[data.length - 1].time;
    const maxA = Math.max(...data.map(d => d.altitude), 1);

    ctx.strokeStyle = 'rgba(60,80,110,0.15)'; ctx.lineWidth = 0.3;
    for (let i = 1; i < 4; i++) {
        const gy = plotT + (i / 4) * plotH;
        ctx.beginPath(); ctx.moveTo(plotL, gy); ctx.lineTo(plotR, gy); ctx.stroke();
    }

    ctx.fillStyle = COL.miniPlotFill; ctx.beginPath();
    const step = Math.max(1, Math.floor(data.length / pw));
    ctx.moveTo(plotL, plotB);
    for (let i = 0; i < data.length; i += step) {
        const d = data[i]; ctx.lineTo(plotL + (d.time / maxT) * plotW, plotB - (d.altitude / maxA) * plotH);
    }
    ctx.lineTo(plotR, plotB); ctx.closePath(); ctx.fill();

    ctx.strokeStyle = COL.miniPlotLine; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < data.length; i += step) {
        const d = data[i]; const tx = plotL + (d.time / maxT) * plotW; const ty = plotB - (d.altitude / maxA) * plotH;
        if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
    }
    ctx.stroke();

    const curD = data[frameIndex];
    const cxp = plotL + (curD.time / maxT) * plotW, cyp = plotB - (curD.altitude / maxA) * plotH;
    ctx.fillStyle = COL.miniPlotCur;
    ctx.beginPath(); ctx.arc(cxp, cyp, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(100,181,246,0.3)'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(cxp, plotT); ctx.lineTo(cxp, plotB); ctx.stroke(); ctx.setLineDash([]);
}

/* ---- Helpers ---- */
function niceStep(range: number, targetTicks: number): number {
    const rough = range / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const r = rough / mag;
    return (r <= 1.5 ? 1 : r <= 3 ? 2 : r <= 7 ? 5 : 10) * mag;
}

function seededRand(seed: number): number {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

function lerpColor(c0: string, c1: string, t: number): string {
    const p = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
    const r = Math.round(p(c0, 1) + (p(c1, 1) - p(c0, 1)) * t);
    const g = Math.round(p(c0, 3) + (p(c1, 3) - p(c0, 3)) * t);
    const b = Math.round(p(c0, 5) + (p(c1, 5) - p(c0, 5)) * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}
