import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useStore } from '../store/useStore';
import { calculateStability, calculateDrag, getComponentPositions, getRocketLength, getMaxRadius, getReferenceArea, findAirbrakes } from '../physics/aerodynamics';
import { getAtmosphere, getDynamicPressure } from '../physics/atmosphere';
import { fmtU, fmt, unitLabel, toDisplay } from '../utils/units';

const COLORS = ['#2196F3', '#4CAF50', '#FF9800', '#f44336', '#9C27B0', '#00BCD4', '#FF5722', '#795548', '#607D8B', '#E91E63'];

export const AnalysisPanel: React.FC = () => {
    const { rocket, stability, selectedMotor, unitSystem: us } = useStore();
    const motorPosition = useStore(s => s.motorPosition);
    const [compareExtended, setCompareExtended] = useState(false);
    const [positionReference, setPositionReference] = useState<'top' | 'bottom'>('top');
    const [percentMode, setPercentMode] = useState<'length' | 'target'>('length');

    const analysis = useMemo(() => {
        const positions = getComponentPositions(rocket);
        const totalLength = getRocketLength(rocket);
        const maxRadius = getMaxRadius(rocket);
        const refArea = getReferenceArea(rocket);

        // Mass breakdown
        const massItems: { name: string; mass: number; type: string }[] = [];

        function collectMass(components: any[], depth: number = 0) {
            for (const comp of components) {
                if (comp.mass > 0) {
                    massItems.push({ name: comp.name, mass: comp.mass, type: comp.type }); // kilograms (SI)
                }
                if (comp.children) {
                    collectMass(comp.children, depth + 1);
                }
            }
        }

        for (const stage of rocket.stages) {
            collectMass(stage.components);
        }

        // Add motor mass if selected
        if (selectedMotor) {
            massItems.push({ name: selectedMotor.designation + ' (Motor)', mass: selectedMotor.totalMass, type: 'motor' });
        }

        const totalMass = massItems.reduce((s, m) => s + m.mass, 0);

        // Drag breakdown at a reference speed (50 m/s at sea level)
        const refSpeed = 50;
        const atm = getAtmosphere(0);
        const dynP = getDynamicPressure(refSpeed, atm.density);

        // Calculate real drag using the aerodynamics engine
        const aeroForces = calculateDrag(rocket, refSpeed, 0, selectedMotor, motorPosition);
        const totalCd = aeroForces.cd;
        const hasAirbrakes = findAirbrakes(rocket).length > 0;

        // Build drag breakdown from real calculated values
        const dragData: { name: string; value: number }[] = [];
        if (totalCd > 0) {
            dragData.push({ name: 'Friction Drag', value: parseFloat(aeroForces.cdFriction.toFixed(4)) });
            dragData.push({ name: 'Pressure Drag', value: parseFloat(aeroForces.cdPressure.toFixed(4)) });
            dragData.push({ name: 'Base Drag', value: parseFloat(aeroForces.cdBase.toFixed(4)) });
            if (hasAirbrakes && aeroForces.cdAirbrakes > 0) {
                dragData.push({ name: 'Airbrakes (deployed)', value: parseFloat(aeroForces.cdAirbrakes.toFixed(4)) });
            }
        }

        // Stability at different speeds
        const stabilityVsSpeed: { speed: number; margin: number; cp: number; cg: number }[] = [];
        for (let v = 10; v <= 200; v += 10) {
            const stab = calculateStability(rocket, selectedMotor, motorPosition);
            stabilityVsSpeed.push({
                speed: v,
                margin: stab.stabilityMargin,
                cp: stab.cp * 100,
                cg: stab.cg * 100,
            });
        }

        // Component lengths for geometry breakdown
        const geometryData = positions.map(p => ({
            name: p.component.name,
            length: parseFloat(((p.component as any).length ? (p.component as any).length * 100 : 0).toFixed(1)),
            position: parseFloat((p.xStart * 100).toFixed(1)),
        }));

        return {
            positions,
            totalLength,
            maxRadius,
            refArea,
            massItems,
            totalMass,
            dragData,
            totalCd,
            stabilityVsSpeed,
            geometryData,
        };
    }, [rocket, stability, selectedMotor]);

    // Convert geometry lengths for display
    const displayGeometryData = analysis.geometryData.map(g => ({
        ...g,
        length: parseFloat(toDisplay(g.length / 100, 'cm', us).toFixed(1)),
        position: parseFloat(toDisplay(g.position / 100, 'cm', us).toFixed(1)),
    }));

    const barrowmanStability = useMemo(
        () => calculateStability(rocket, selectedMotor, motorPosition, undefined, undefined, { model: 'barrowman' }),
        [rocket, selectedMotor, motorPosition]
    );

    const extendedStability = useMemo(
        () => calculateStability(rocket, selectedMotor, motorPosition, undefined, undefined, { model: 'extended-high-alpha', alphaDeg: 12 }),
        [rocket, selectedMotor, motorPosition]
    );

    const fromBottom = positionReference === 'bottom';
    const cgDisplay = stability ? (fromBottom ? (stability.totalLength - stability.cg) : stability.cg) : 0;
    const cpDisplay = stability ? (fromBottom ? (stability.totalLength - stability.cp) : stability.cp) : 0;
    const stabilityPercentLength = stability && stability.totalLength > 0
        ? ((stability.cp - stability.cg) / stability.totalLength) * 100
        : 0;
    const stabilityPercentTarget = stability ? stability.stabilityMargin * 100 : 0;
    const stabilityPercent = percentMode === 'length' ? stabilityPercentLength : stabilityPercentTarget;
    const stabilityPercentLabel = percentMode === 'length' ? '% of length' : '% of 1-cal target';

    return (
        <div className="analysis-panel">
            <h2>Rocket Analysis</h2>

            {/* Geometry Summary */}
            <div className="analysis-section">
                <h3>Geometry</h3>
                <div className="analysis-grid">
                    <div className="analysis-item">
                        <span className="a-label">Total Length</span>
                        <span className="a-value">{fmtU(analysis.totalLength, 'cm', us)}</span>
                    </div>
                    <div className="analysis-item">
                        <span className="a-label">Max Diameter</span>
                        <span className="a-value">{fmtU(analysis.maxRadius * 2, 'mm', us)}</span>
                    </div>
                    <div className="analysis-item">
                        <span className="a-label">Reference Area</span>
                        <span className="a-value">{fmtU(analysis.refArea, 'cm2', us)}</span>
                    </div>
                    <div className="analysis-item">
                        <span className="a-label">Fineness Ratio</span>
                        <span className="a-value">{analysis.maxRadius > 0 ? (analysis.totalLength / (2 * analysis.maxRadius)).toFixed(1) : 'N/A'}</span>
                    </div>
                </div>

                {/* Component lengths */}
                {analysis.geometryData.length > 0 && (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={displayGeometryData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#2d323a" />
                            <XAxis type="number" label={{ value: `Length (${unitLabel('cm', us)})`, position: 'insideBottomRight', offset: -5, fill: '#8b919c' }} stroke="#3a3f48" tick={{ fill: '#8b919c', fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#8b919c' }} stroke="#3a3f48" />
                            <Tooltip formatter={(v: number) => [`${v.toFixed(1)} ${unitLabel('cm', us)}`, 'Length']} contentStyle={{ backgroundColor: '#282c34', border: '1px solid #3a3f48', borderRadius: '4px', color: '#ced4de' }} />
                            <Bar dataKey="length" fill="#3b8eed" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Mass Breakdown */}
            <div className="analysis-section">
                <h3>Mass Breakdown</h3>
                <div className="analysis-grid">
                    <div className="analysis-item">
                        <span className="a-label">Total Mass</span>
                        <span className="a-value">{fmtU(analysis.totalMass, 'g', us)}</span>
                    </div>
                    <div className="analysis-item">
                        <span className="a-label">Components</span>
                        <span className="a-value">{analysis.massItems.length}</span>
                    </div>
                </div>

                {analysis.massItems.length > 0 && (
                    <div className="mass-charts">
                        <div className="mass-pie">
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie
                                        data={analysis.massItems.map(m => ({ name: m.name, value: parseFloat(toDisplay(m.mass, 'g', us).toFixed(1)) }))}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={90}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        labelLine={true}
                                        stroke="#1a1d23"
                                    >
                                        {analysis.massItems.map((_, i) => (
                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)} ${unitLabel('g', us)}`, 'Mass']} contentStyle={{ backgroundColor: '#282c34', border: '1px solid #3a3f48', borderRadius: '4px', color: '#ced4de' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="mass-table">
                            <table>
                                <thead>
                                    <tr><th>Component</th><th>Mass ({unitLabel('g', us)})</th><th>%</th></tr>
                                </thead>
                                <tbody>
                                    {analysis.massItems.map((item, i) => (
                                        <tr key={i}>
                                            <td>
                                                <span className="mass-color" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                                                {item.name}
                                            </td>
                                            <td>{toDisplay(item.mass, 'g', us).toFixed(1)}</td>
                                            <td>{analysis.totalMass > 0 ? ((item.mass / analysis.totalMass) * 100).toFixed(1) : '0'}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Stability */}
            <div className="analysis-section">
                <h3>Stability Analysis</h3>
                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        id="extended-model-toggle"
                        type="checkbox"
                        checked={compareExtended}
                        onChange={(e) => setCompareExtended(e.target.checked)}
                    />
                    <label htmlFor="extended-model-toggle" style={{ color: '#ced4de', cursor: 'pointer' }}>
                        Compare with Extended high-α model (Jorgensen-style body correction, α = 12°)
                    </label>
                </div>
                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                        className={`view-btn ${!fromBottom ? 'active' : ''}`}
                        onClick={() => setPositionReference('top')}
                        title="Measure CG/CP from rocket nose"
                    >
                        From Top (Nose)
                    </button>
                    <button
                        className={`view-btn ${fromBottom ? 'active' : ''}`}
                        onClick={() => setPositionReference('bottom')}
                        title="Measure CG/CP from rocket tail"
                    >
                        From Bottom (Tail)
                    </button>
                </div>
                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                        className={`view-btn ${percentMode === 'length' ? 'active' : ''}`}
                        onClick={() => setPercentMode('length')}
                        title="Stability percent relative to total rocket length"
                    >
                        % of Length
                    </button>
                    <button
                        className={`view-btn ${percentMode === 'target' ? 'active' : ''}`}
                        onClick={() => setPercentMode('target')}
                        title="Stability percent relative to 1-caliber target"
                    >
                        % of 1-cal Target
                    </button>
                </div>
                {stability ? (
                    <>
                        <div className="analysis-grid">
                            <div className="analysis-item">
                                <span className="a-label">CG ({fromBottom ? 'from tail' : 'from nose'})</span>
                                <span className="a-value">{fmtU(cgDisplay, 'cm', us)}</span>
                            </div>
                            <div className="analysis-item">
                                <span className="a-label">CP ({fromBottom ? 'from tail' : 'from nose'})</span>
                                <span className="a-value">{fmtU(cpDisplay, 'cm', us)}</span>
                            </div>
                            <div className="analysis-item">
                                <span className="a-label">Stability Margin</span>
                                <span className="a-value">{stability.stabilityMargin.toFixed(2)} cal</span>
                            </div>
                            <div className="analysis-item">
                                <span className="a-label">Static Margin</span>
                                <span className="a-value">{fmtU(stability.cp - stability.cg, 'cm', us)}</span>
                            </div>
                            <div className="analysis-item">
                                <span className="a-label">Stability (%)</span>
                                <span className="a-value">{stabilityPercent.toFixed(2)} {stabilityPercentLabel}</span>
                            </div>
                        </div>
                        <div className={`stability-status ${stability.stabilityMargin < 1 ? 'unstable' :
                            stability.stabilityMargin < 1.5 ? 'marginal' :
                                stability.stabilityMargin < 3 ? 'stable' : 'overstable'
                            }`}>
                            {stability.stabilityMargin < 1 && '⚠️ UNSTABLE: The rocket needs more stability margin. Add fins or move CG forward.'}
                            {stability.stabilityMargin >= 1 && stability.stabilityMargin < 1.5 && '⚡ MARGINAL: Stability is borderline. Consider increasing fin size.'}
                            {stability.stabilityMargin >= 1.5 && stability.stabilityMargin < 3 && '✅ STABLE: Good stability margin for safe flight.'}
                            {stability.stabilityMargin >= 3 && '🔒 OVERSTABLE: The rocket may weathercock in wind. Consider reducing fin size.'}
                        </div>

                        {compareExtended && (
                            <div style={{ marginTop: 14 }}>
                                <h4 style={{ marginBottom: 10 }}>Model Comparison</h4>
                                <div className="analysis-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                                    <div className="analysis-item">
                                        <span className="a-label">Barrowman CP</span>
                                        <span className="a-value">{fmtU(barrowmanStability.cp, 'cm', us)}</span>
                                    </div>
                                    <div className="analysis-item">
                                        <span className="a-label">Extended CP</span>
                                        <span className="a-value">{fmtU(extendedStability.cp, 'cm', us)}</span>
                                    </div>
                                    <div className="analysis-item">
                                        <span className="a-label">Barrowman Margin</span>
                                        <span className="a-value">{barrowmanStability.stabilityMargin.toFixed(2)} cal</span>
                                    </div>
                                    <div className="analysis-item">
                                        <span className="a-label">Extended Margin</span>
                                        <span className="a-value">{extendedStability.stabilityMargin.toFixed(2)} cal</span>
                                    </div>
                                    <div className="analysis-item">
                                        <span className="a-label">ΔCP (Ext - Bar)</span>
                                        <span className="a-value">{fmtU(extendedStability.cp - barrowmanStability.cp, 'cm', us, 2)}</span>
                                    </div>
                                    <div className="analysis-item">
                                        <span className="a-label">ΔMargin (Ext - Bar)</span>
                                        <span className="a-value">{(extendedStability.stabilityMargin - barrowmanStability.stabilityMargin).toFixed(2)} cal</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <p>Add components to see stability analysis.</p>
                )}
            </div>

            {/* Drag Analysis */}
            <div className="analysis-section">
                <h3>Drag Analysis (at {fmtU(50, 'mps', us)}, sea level)</h3>
                <div className="analysis-grid">
                    <div className="analysis-item">
                        <span className="a-label">Total Cd</span>
                        <span className="a-value">{analysis.totalCd.toFixed(4)}</span>
                    </div>
                    <div className="analysis-item">
                        <span className="a-label">Drag Force</span>
                        <span className="a-value">{fmtU(0.5 * 1.225 * 50 * 50 * analysis.refArea * analysis.totalCd, 'N', us)}</span>
                    </div>
                </div>
                {analysis.dragData.length > 0 && (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={analysis.dragData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2d323a" />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8b919c' }} stroke="#3a3f48" />
                            <YAxis label={{ value: 'Cd contribution', angle: -90, position: 'insideLeft', fill: '#8b919c' }} stroke="#3a3f48" tick={{ fill: '#8b919c', fontSize: 11 }} />
                            <Tooltip formatter={(v: number) => [v.toFixed(4), 'Cd']} contentStyle={{ backgroundColor: '#282c34', border: '1px solid #3a3f48', borderRadius: '4px', color: '#ced4de' }} />
                            <Bar dataKey="value" fill="#e74c3c" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Motor Info */}
            {selectedMotor && (
                <div className="analysis-section">
                    <h3>Motor Analysis</h3>
                    <div className="analysis-grid">
                        <div className="analysis-item">
                            <span className="a-label">Motor</span>
                            <span className="a-value">{selectedMotor.designation}</span>
                        </div>
                        <div className="analysis-item">
                            <span className="a-label">Total Impulse</span>
                            <span className="a-value">{fmtU(selectedMotor.totalImpulse, 'Ns', us)}</span>
                        </div>
                        <div className="analysis-item">
                            <span className="a-label">Thrust-to-Weight</span>
                            <span className="a-value">
                                {analysis.totalMass > 0 ?
                                    (selectedMotor.averageThrust / (analysis.totalMass * 9.81)).toFixed(1) + ':1'
                                    : 'N/A'}
                            </span>
                        </div>
                        <div className="analysis-item">
                            <span className="a-label">Specific Impulse</span>
                            <span className="a-value">{(selectedMotor.totalImpulse / (selectedMotor.propellantMass * 9.81)).toFixed(1)} s</span>
                        </div>
                    </div>

                    {/* Thrust to weight check */}
                    {analysis.totalMass > 0 && (
                        <div className={`twr-status ${(selectedMotor.averageThrust / (analysis.totalMass * 9.81)) < 5 ? 'low-twr' : 'good-twr'
                            }`}>
                            {(selectedMotor.averageThrust / (analysis.totalMass * 9.81)) < 5
                                ? '⚠️ Low thrust-to-weight ratio. Recommended minimum is 5:1 for safe flight.'
                                : '✅ Thrust-to-weight ratio is adequate for safe launch.'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
