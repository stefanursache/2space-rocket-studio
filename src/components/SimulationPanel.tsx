import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { FlightPlot } from './FlightPlot';
import { FlightAnimation } from './FlightAnimation';
import { interpolateThrust } from '../models/motors';
import { Motor } from '../types/rocket';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toDisplay, toSI, unitLabel, fmtU, fmt, tempToDisplay, tempToSI, pressToDisplay, pressToSI, UnitSystem } from '../utils/units';

/** Numeric input that uses local state while editing so the value doesn't reset */
const SimNumInput: React.FC<{
    value: number; onChange: (v: number) => void; step?: number | string; fallback?: number;
}> = ({ value, onChange, step, fallback = 0 }) => {
    const [local, setLocal] = useState(String(value));
    const [editing, setEditing] = useState(false);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { if (!editing) setLocal(String(value)); }, [value, editing]);
    const commit = () => {
        setEditing(false);
        const p = parseFloat(local);
        onChange(isNaN(p) ? fallback : p);
    };
    return (
        <input ref={ref} type="number" step={step}
            value={local}
            onFocus={() => { setEditing(true); setTimeout(() => ref.current?.select(), 0); }}
            onChange={e => setLocal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
                if (e.key === 'Enter') { commit(); ref.current?.blur(); }
                if (e.key === 'Escape') { setEditing(false); setLocal(String(value)); ref.current?.blur(); }
            }}
        />
    );
};

export const SimulationPanel: React.FC = () => {
    const {
        rocket, simulationResults, activeSimulationId, isSimulating,
        runSim, deleteSimulation, setActiveSimulation,
        selectedMotor, setSelectedMotor, simulationOptions, setSimulationOptions,
        motors, unitSystem: us,
    } = useStore();

    const [motorSearch, setMotorSearch] = useState('');
    const [motorClassFilter, setMotorClassFilter] = useState<string>('all');
    const [motorDiameterFilter, setMotorDiameterFilter] = useState<number>(0);
    const [showMotorList, setShowMotorList] = useState(!selectedMotor);
    const [resultView, setResultView] = useState<'plots' | 'animation'>('plots');

    const motorClasses = useMemo(() => {
        const s = new Set(motors.map(m => m.impulseClass));
        return Array.from(s).sort();
    }, [motors]);

    const motorDiameters = useMemo(() => {
        const s = new Set(motors.map(m => m.diameter));
        return Array.from(s).sort((a, b) => a - b);
    }, [motors]);

    const filteredMotors = useMemo(() => {
        return motors.filter(m => {
            if (motorClassFilter !== 'all' && m.impulseClass !== motorClassFilter) return false;
            if (motorDiameterFilter > 0 && m.diameter !== motorDiameterFilter) return false;
            if (motorSearch && !m.designation.toLowerCase().includes(motorSearch.toLowerCase())
                && !m.manufacturer.toLowerCase().includes(motorSearch.toLowerCase())) return false;
            return true;
        });
    }, [motors, motorClassFilter, motorDiameterFilter, motorSearch]);

    const thrustCurveData = useMemo(() => {
        if (!selectedMotor) return [];
        const data = [];
        const step = selectedMotor.burnTime / 80;
        for (let t = 0; t <= selectedMotor.burnTime; t += step) {
            data.push({ time: parseFloat(t.toFixed(3)), thrust: parseFloat(interpolateThrust(selectedMotor, t).toFixed(2)) });
        }
        return data;
    }, [selectedMotor]);

    const handleRunSimulation = () => {
        if (!selectedMotor) {
            alert('Please select a motor first (use the motor selector in the toolbar).');
            return;
        }
        runSim();
    };

    const activeResult = simulationResults.find(r => r.id === activeSimulationId);

    return (
        <div className="simulation-panel">
            <div className="simulation-config">
                <h3>Simulation Configuration</h3>

                <div className="sim-section">
                    <h4>Launch Conditions</h4>
                    <div className="sim-field">
                        <label>Rod Length ({unitLabel('m', us)})</label>
                        <SimNumInput step={us === 'us' ? 0.5 : 0.1} value={toDisplay(simulationOptions.launchRodLength, 'm', us)}
                            onChange={v => setSimulationOptions({ launchRodLength: toSI(v, 'm', us) })} />
                    </div>
                    <div className="sim-field">
                        <label>Rod Angle (°)</label>
                        <SimNumInput step="1" value={simulationOptions.launchRodAngle}
                            onChange={v => setSimulationOptions({ launchRodAngle: v })} />
                    </div>
                    <div className="sim-field">
                        <label>Rod Direction (°)</label>
                        <SimNumInput step="10" value={simulationOptions.launchRodDirection ?? 0}
                            onChange={v => setSimulationOptions({ launchRodDirection: v })} />
                        <span style={{ fontSize: '9px', color: '#6a7a8a', marginTop: 2 }}>0°=N, 90°=E, 180°=S, 270°=W</span>
                    </div>
                    <div className="sim-field">
                        <label>Launch Altitude ({unitLabel('m_alt', us)})</label>
                        <SimNumInput step={us === 'us' ? 300 : 100} value={toDisplay(simulationOptions.launchAltitude, 'm_alt', us)}
                            onChange={v => setSimulationOptions({ launchAltitude: toSI(v, 'm_alt', us) })} />
                    </div>
                    <div className="sim-field">
                        <label>Launch Latitude (°)</label>
                        <SimNumInput step="1" value={simulationOptions.launchLatitude}
                            onChange={v => setSimulationOptions({ launchLatitude: v })} />
                    </div>
                </div>

                <div className="sim-section">
                    <h4>Atmosphere</h4>
                    <div className="sim-field">
                        <label>Temperature ({us === 'us' ? '°F' : '°C'})</label>
                        <SimNumInput step="1" value={Math.round(tempToDisplay(simulationOptions.launchTemperature, us) * 100) / 100}
                            onChange={v => setSimulationOptions({ launchTemperature: tempToSI(v, us) })} fallback={us === 'us' ? 59 : 15} />
                    </div>
                    <div className="sim-field">
                        <label>Pressure ({unitLabel('press', us)})</label>
                        <SimNumInput step={us === 'us' ? 0.1 : 1} value={Math.round(pressToDisplay(simulationOptions.launchPressure, us) * 100) / 100}
                            onChange={v => setSimulationOptions({ launchPressure: pressToSI(v, us) })} fallback={us === 'us' ? 29.92 : 1013} />
                    </div>
                </div>

                <div className="sim-section">
                    <h4>Wind</h4>
                    <div className="sim-field">
                        <label>Avg Wind Speed ({unitLabel('wind', us)})</label>
                        <SimNumInput step={us === 'us' ? 1 : 0.5} value={toDisplay(simulationOptions.windSpeedAvg, 'wind', us)}
                            onChange={v => setSimulationOptions({ windSpeedAvg: toSI(v, 'wind', us) })} />
                    </div>
                    <div className="sim-field">
                        <label>Wind Std Dev ({unitLabel('wind', us)})</label>
                        <SimNumInput step={us === 'us' ? 0.5 : 0.1} value={toDisplay(simulationOptions.windSpeedStdDev, 'wind', us)}
                            onChange={v => setSimulationOptions({ windSpeedStdDev: toSI(v, 'wind', us) })} />
                    </div>
                    <div className="sim-field">
                        <label>Wind Direction (°)</label>
                        <SimNumInput step="10" value={simulationOptions.windDirection ?? 90}
                            onChange={v => setSimulationOptions({ windDirection: v })} />
                    </div>
                </div>

                <div className="sim-section">
                    <h4>Simulation Settings</h4>
                    <div className="sim-field">
                        <label>Time Step (s)</label>
                        <input type="number" step="0.001" value={simulationOptions.timeStep}
                            onChange={e => setSimulationOptions({ timeStep: parseFloat(e.target.value) || 0.01 })} />
                    </div>
                    <div className="sim-field">
                        <label>Max Time (s)</label>
                        <input type="number" step="10" value={simulationOptions.maxTime}
                            onChange={e => setSimulationOptions({ maxTime: parseFloat(e.target.value) || 300 })} />
                    </div>
                </div>

                <div className="sim-section sim-motor-section">
                    <h4>Motor Selection</h4>
                    {selectedMotor && (
                        <div className="motor-badge">
                            <div className="motor-badge-header">
                                <strong>{selectedMotor.designation}</strong>
                                <button className="btn-change-motor" onClick={() => setShowMotorList(!showMotorList)}>
                                    {showMotorList ? 'Hide' : 'Change'}
                                </button>
                            </div>
                            <span>{selectedMotor.manufacturer} | {fmt(selectedMotor.diameter, 'motor_mm', us)} {unitLabel('motor_mm', us)} × {fmt(selectedMotor.length, 'motor_mm', us)} {unitLabel('motor_mm', us)}</span>
                            <span>Total impulse: {fmtU(selectedMotor.totalImpulse, 'Ns', us)} | Avg thrust: {fmtU(selectedMotor.averageThrust, 'N', us)}</span>
                            <span>Burn: {selectedMotor.burnTime.toFixed(2)}s | Mass: {fmtU(selectedMotor.totalMass, 'g', us)}</span>
                            {/* Inline thrust curve */}
                            <div style={{ width: '100%', height: 120, marginTop: 6 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={thrustCurveData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#2d323a" />
                                        <XAxis dataKey="time" tick={{ fill: '#8b919c', fontSize: 9 }} stroke="#3a3f48" />
                                        <YAxis tick={{ fill: '#8b919c', fontSize: 9 }} stroke="#3a3f48" />
                                        <Tooltip
                                            formatter={(v: number) => [`${v.toFixed(1)} N`, 'Thrust']}
                                            labelFormatter={(l: number) => `t=${l.toFixed(2)}s`}
                                            contentStyle={{ backgroundColor: '#282c34', border: '1px solid #3a3f48', borderRadius: 4, color: '#ced4de', fontSize: 11 }}
                                        />
                                        <Line type="monotone" dataKey="thrust" stroke="#e67e22" dot={false} strokeWidth={2} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {(showMotorList || !selectedMotor) && (
                        <div className="sim-motor-picker">
                            <div className="motor-picker-filters">
                                <input type="text" placeholder="Search motors..." value={motorSearch}
                                    onChange={e => setMotorSearch(e.target.value)} />
                                <select value={motorClassFilter} onChange={e => setMotorClassFilter(e.target.value)}>
                                    <option value="all">All Classes</option>
                                    {motorClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
                                </select>
                                <select value={motorDiameterFilter} onChange={e => setMotorDiameterFilter(Number(e.target.value))}>
                                    <option value={0}>All Ø</option>
                                    {motorDiameters.map(d => <option key={d} value={d}>{fmt(d, 'motor_mm', us)}{unitLabel('motor_mm', us)}</option>)}
                                </select>
                            </div>
                            <div className="motor-picker-list">
                                {filteredMotors.slice(0, 40).map(motor => (
                                    <div
                                        key={motor.designation}
                                        className={`motor-picker-item ${selectedMotor?.designation === motor.designation ? 'active' : ''}`}
                                        onClick={() => { setSelectedMotor(motor); setShowMotorList(false); }}
                                    >
                                        <span className="mpk-desig">{motor.designation}</span>
                                        <span className="mpk-mfg">{motor.manufacturer}</span>
                                        <span className="mpk-stats">{fmt(motor.totalImpulse, 'Ns', us)}{unitLabel('Ns', us)} · {fmt(motor.averageThrust, 'N', us)}{unitLabel('N', us)} · {motor.burnTime.toFixed(1)}s</span>
                                    </div>
                                ))}
                                {filteredMotors.length > 40 && (
                                    <div className="motor-picker-more">{filteredMotors.length - 40} more — refine search</div>
                                )}
                                {filteredMotors.length === 0 && (
                                    <div className="motor-picker-empty">No motors match filters</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <button className="run-sim-btn" onClick={handleRunSimulation} disabled={isSimulating || !selectedMotor}>
                    {isSimulating ? 'Running...' : '▶ Run Simulation'}
                </button>
            </div>

            <div className="simulation-results">
                <h3>Simulation Results</h3>

                {simulationResults.length === 0 ? (
                    <p className="no-results">No simulations yet. Configure settings and click "Run Simulation".</p>
                ) : (
                    <>
                        <div className="sim-result-list">
                            {simulationResults.map((result, i) => (
                                <div
                                    key={result.id}
                                    className={`sim-result-item ${result.id === activeSimulationId ? 'active' : ''}`}
                                    onClick={() => setActiveSimulation(result.id)}
                                >
                                    <div className="sim-result-header">
                                        <span className="sim-result-name">Sim #{i + 1}</span>
                                        <button className="sim-delete-btn" onClick={(e) => { e.stopPropagation(); deleteSimulation(result.id); }}>✕</button>
                                    </div>
                                    <div className="sim-result-stats">
                                        <span>Apogee: {fmtU(result.maxAltitude, 'm_alt', us)}</span>
                                        <span>Max V: {fmtU(result.maxVelocity, 'mps', us)}</span>
                                        <span>Max Accel: {fmtU(result.maxAcceleration, 'mps2', us)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {activeResult && (
                            <div className="sim-active-detail">
                                <div className="sim-view-tabs">
                                    <button
                                        className={`sim-view-tab ${resultView === 'plots' ? 'active' : ''}`}
                                        onClick={() => setResultView('plots')}
                                    >
                                        📊 Plots & Data
                                    </button>
                                    <button
                                        className={`sim-view-tab ${resultView === 'animation' ? 'active' : ''}`}
                                        onClick={() => setResultView('animation')}
                                    >
                                        🚀 Flight Animation
                                    </button>
                                </div>

                                {resultView === 'plots' && (
                                    <>
                                        <h4>Flight Summary</h4>
                                        <div className="sim-summary-grid">
                                            <div className="sum-item">
                                                <span className="sum-label">Apogee</span>
                                                <span className="sum-value">{fmtU(activeResult.maxAltitude, 'm_alt', us)}</span>
                                            </div>
                                            <div className="sum-item">
                                                <span className="sum-label">Max Speed</span>
                                                <span className="sum-value">{fmtU(activeResult.maxVelocity, 'mps', us)}</span>
                                            </div>
                                            <div className="sum-item">
                                                <span className="sum-label">Max Mach</span>
                                                <span className="sum-value">{activeResult.maxMach.toFixed(3)}</span>
                                            </div>
                                            <div className="sum-item">
                                                <span className="sum-label">Max Accel</span>
                                                <span className="sum-value">{fmtU(activeResult.maxAcceleration, 'mps2', us)} ({(activeResult.maxAcceleration / 9.81).toFixed(1)}g)</span>
                                            </div>
                                            <div className="sum-item">
                                                <span className="sum-label">Flight Time</span>
                                                <span className="sum-value">{activeResult.flightTime.toFixed(1)} s</span>
                                            </div>
                                            <div className="sum-item">
                                                <span className="sum-label">Ground Hit V</span>
                                                <span className="sum-value">{fmtU(activeResult.groundHitVelocity, 'mps', us)}</span>
                                            </div>
                                        </div>

                                        <h4>Events</h4>
                                        <div className="sim-events">
                                            {activeResult.events.map((evt, i) => (
                                                <div key={i} className="sim-event">
                                                    <span className="evt-time">{evt.time.toFixed(2)}s</span>
                                                    <span className="evt-type">{evt.type}</span>
                                                    <span className="evt-desc">{evt.description}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <FlightPlot result={activeResult} />
                                    </>
                                )}

                                {resultView === 'animation' && (
                                    <FlightAnimation result={activeResult} />
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
