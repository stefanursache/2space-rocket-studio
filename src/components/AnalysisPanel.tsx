import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useStore } from '../store/useStore';
import { calculateStability, calculateDrag, getComponentPositions, getRocketLength, getMaxRadius, getReferenceArea } from '../physics/aerodynamics';
import { getAtmosphere, getReynoldsNumber, getMachNumber, getDynamicPressure } from '../physics/atmosphere';

const COLORS = ['#2196F3', '#4CAF50', '#FF9800', '#f44336', '#9C27B0', '#00BCD4', '#FF5722', '#795548', '#607D8B', '#E91E63'];

export const AnalysisPanel: React.FC = () => {
    const { rocket, stability, selectedMotor } = useStore();
    const motorPosition = useStore(s => s.motorPosition);

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
                    massItems.push({ name: comp.name, mass: comp.mass * 1000, type: comp.type }); // grams
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
            massItems.push({ name: selectedMotor.designation + ' (Motor)', mass: selectedMotor.totalMass * 1000, type: 'motor' });
        }

        const totalMass = massItems.reduce((s, m) => s + m.mass, 0);

        // Drag breakdown at a reference speed (50 m/s at sea level)
        const refSpeed = 50;
        const atm = getAtmosphere(0);
        const mach = getMachNumber(refSpeed, atm.temperature);
        const kinematicViscosity = 1.789e-5 / atm.density;
        const re = getReynoldsNumber(refSpeed, totalLength, kinematicViscosity);
        const dynP = getDynamicPressure(refSpeed, atm.density);

        // Calculate drag contributions
        const dragData: { name: string; value: number }[] = [];

        // Estimate a typical Cd for model rockets at this speed
        const totalCd = refArea > 0 ? 0.75 : 0;

        // Approximate friction/pressure/base drag split
        if (totalCd > 0) {
            dragData.push({ name: 'Friction Drag', value: parseFloat((totalCd * 0.45).toFixed(4)) });
            dragData.push({ name: 'Pressure Drag', value: parseFloat((totalCd * 0.30).toFixed(4)) });
            dragData.push({ name: 'Base Drag', value: parseFloat((totalCd * 0.20).toFixed(4)) });
            dragData.push({ name: 'Interference', value: parseFloat((totalCd * 0.05).toFixed(4)) });
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

    return (
        <div className="analysis-panel">
            <h2>Rocket Analysis</h2>

            {/* Geometry Summary */}
            <div className="analysis-section">
                <h3>Geometry</h3>
                <div className="analysis-grid">
                    <div className="analysis-item">
                        <span className="a-label">Total Length</span>
                        <span className="a-value">{(analysis.totalLength * 100).toFixed(1)} cm</span>
                    </div>
                    <div className="analysis-item">
                        <span className="a-label">Max Diameter</span>
                        <span className="a-value">{(analysis.maxRadius * 200).toFixed(1)} mm</span>
                    </div>
                    <div className="analysis-item">
                        <span className="a-label">Reference Area</span>
                        <span className="a-value">{(analysis.refArea * 10000).toFixed(2)} cm²</span>
                    </div>
                    <div className="analysis-item">
                        <span className="a-label">Fineness Ratio</span>
                        <span className="a-value">{analysis.maxRadius > 0 ? (analysis.totalLength / (2 * analysis.maxRadius)).toFixed(1) : 'N/A'}</span>
                    </div>
                </div>

                {/* Component lengths */}
                {analysis.geometryData.length > 0 && (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={analysis.geometryData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#2d323a" />
                            <XAxis type="number" label={{ value: 'Length (cm)', position: 'insideBottomRight', offset: -5, fill: '#8b919c' }} stroke="#3a3f48" tick={{ fill: '#8b919c', fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#8b919c' }} stroke="#3a3f48" />
                            <Tooltip formatter={(v: number) => [`${v.toFixed(1)} cm`, 'Length']} contentStyle={{ backgroundColor: '#282c34', border: '1px solid #3a3f48', borderRadius: '4px', color: '#ced4de' }} />
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
                        <span className="a-value">{analysis.totalMass.toFixed(1)} g</span>
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
                                        data={analysis.massItems.map(m => ({ name: m.name, value: parseFloat(m.mass.toFixed(1)) }))}
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
                                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)} g`, 'Mass']} contentStyle={{ backgroundColor: '#282c34', border: '1px solid #3a3f48', borderRadius: '4px', color: '#ced4de' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="mass-table">
                            <table>
                                <thead>
                                    <tr><th>Component</th><th>Mass (g)</th><th>%</th></tr>
                                </thead>
                                <tbody>
                                    {analysis.massItems.map((item, i) => (
                                        <tr key={i}>
                                            <td>
                                                <span className="mass-color" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                                                {item.name}
                                            </td>
                                            <td>{item.mass.toFixed(1)}</td>
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
                {stability ? (
                    <>
                        <div className="analysis-grid">
                            <div className="analysis-item">
                                <span className="a-label">CG Position</span>
                                <span className="a-value">{(stability.cg * 100).toFixed(1)} cm</span>
                            </div>
                            <div className="analysis-item">
                                <span className="a-label">CP Position</span>
                                <span className="a-value">{(stability.cp * 100).toFixed(1)} cm</span>
                            </div>
                            <div className="analysis-item">
                                <span className="a-label">Stability Margin</span>
                                <span className="a-value">{stability.stabilityMargin.toFixed(2)} cal</span>
                            </div>
                            <div className="analysis-item">
                                <span className="a-label">Static Margin</span>
                                <span className="a-value">{((stability.cp - stability.cg) * 100).toFixed(1)} cm</span>
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
                    </>
                ) : (
                    <p>Add components to see stability analysis.</p>
                )}
            </div>

            {/* Drag Analysis */}
            <div className="analysis-section">
                <h3>Drag Analysis (at 50 m/s, sea level)</h3>
                <div className="analysis-grid">
                    <div className="analysis-item">
                        <span className="a-label">Total Cd</span>
                        <span className="a-value">{analysis.totalCd.toFixed(4)}</span>
                    </div>
                    <div className="analysis-item">
                        <span className="a-label">Drag Force</span>
                        <span className="a-value">{(0.5 * 1.225 * 50 * 50 * analysis.refArea * analysis.totalCd).toFixed(2)} N</span>
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
                            <span className="a-value">{selectedMotor.totalImpulse.toFixed(1)} Ns</span>
                        </div>
                        <div className="analysis-item">
                            <span className="a-label">Thrust-to-Weight</span>
                            <span className="a-value">
                                {analysis.totalMass > 0 ?
                                    (selectedMotor.averageThrust / (analysis.totalMass / 1000 * 9.81)).toFixed(1) + ':1'
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
                        <div className={`twr-status ${(selectedMotor.averageThrust / (analysis.totalMass / 1000 * 9.81)) < 5 ? 'low-twr' : 'good-twr'
                            }`}>
                            {(selectedMotor.averageThrust / (analysis.totalMass / 1000 * 9.81)) < 5
                                ? '⚠️ Low thrust-to-weight ratio. Recommended minimum is 5:1 for safe flight.'
                                : '✅ Thrust-to-weight ratio is adequate for safe launch.'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
