import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore } from '../store/useStore';
import { interpolateThrust } from '../models/motors';
import { Motor } from '../types/rocket';
import { toDisplay, unitLabel, fmt, fmtU } from '../utils/units';

export const MotorSelector: React.FC = () => {
    const {
        selectedMotor, setSelectedMotor, setShowMotorSelector,
        motors, motorSyncStatus, motorSyncProgress, lastMotorSync, motorSyncError,
        syncMotorsFromAPI, ensureThrustCurve, unitSystem: us,
    } = useStore();
    const [filterClass, setFilterClass] = useState<string>('all');
    const [filterDiameter, setFilterDiameter] = useState<number>(0);
    const [filterManufacturer, setFilterManufacturer] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [selectedPreview, setSelectedPreview] = useState<Motor | null>(selectedMotor);
    const [loadingCurve, setLoadingCurve] = useState(false);

    // Auto-fetch thrust curve when preview changes
    useEffect(() => {
        if (!selectedPreview) return;
        if (selectedPreview.thrustCurve.length > 0) return;
        if (!selectedPreview.tcMotorId) return;
        let cancelled = false;
        setLoadingCurve(true);
        ensureThrustCurve(selectedPreview).then(updated => {
            if (!cancelled && updated) {
                setSelectedPreview(updated);
            }
            setLoadingCurve(false);
        });
        return () => { cancelled = true; };
    }, [selectedPreview?.id]);

    // Get unique values for filters
    const classes = useMemo(() => {
        const s = new Set(motors.map(m => m.impulseClass));
        return Array.from(s).sort();
    }, [motors]);

    const diameters = useMemo(() => {
        const s = new Set(motors.map(m => m.diameter));
        return Array.from(s).sort((a, b) => a - b);
    }, [motors]);

    const manufacturers = useMemo(() => {
        const s = new Set(motors.map(m => m.manufacturer));
        return Array.from(s).sort();
    }, [motors]);

    // Filter motors
    const filteredMotors = useMemo(() => {
        return motors.filter(m => {
            if (filterClass !== 'all' && m.impulseClass !== filterClass) return false;
            if (filterDiameter > 0 && m.diameter !== filterDiameter) return false;
            if (filterManufacturer !== 'all' && m.manufacturer !== filterManufacturer) return false;
            if (search && !m.designation.toLowerCase().includes(search.toLowerCase())
                && !m.manufacturer.toLowerCase().includes(search.toLowerCase())
                && !m.commonName.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [motors, filterClass, filterDiameter, filterManufacturer, search]);

    // Thrust curve data for preview
    const thrustData = useMemo(() => {
        if (!selectedPreview) return [];
        const data = [];
        const step = selectedPreview.burnTime / 100;
        for (let t = 0; t <= selectedPreview.burnTime; t += step) {
            data.push({
                time: parseFloat(t.toFixed(3)),
                thrust: parseFloat(interpolateThrust(selectedPreview, t).toFixed(2))
            });
        }
        return data;
    }, [selectedPreview]);

    const handleSelect = async () => {
        if (selectedPreview) {
            // Ensure thrust curve is available before setting as active motor
            const motorWithCurve = await ensureThrustCurve(selectedPreview);
            setSelectedMotor(motorWithCurve);
        }
        setShowMotorSelector(false);
    };

    return (
        <div className="modal-overlay" onClick={() => setShowMotorSelector(false)}>
            <div className="motor-selector-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>🔥 Motor Selection</h2>
                    <button className="modal-close" onClick={() => setShowMotorSelector(false)}>✕</button>
                </div>

                {/* ThrustCurve.org sync bar */}
                <div className="motor-sync-bar">
                    <span className="sync-info">
                        📡 <strong>{motors.length}</strong> motors
                        {lastMotorSync && (
                            <span className="sync-date">
                                &nbsp;· synced {new Date(lastMotorSync).toLocaleDateString()}
                            </span>
                        )}
                        {!lastMotorSync && <span className="sync-date"> · using built-in database</span>}
                    </span>
                    {motorSyncStatus === 'syncing' ? (
                        <span className="sync-progress">⏳ {motorSyncProgress}</span>
                    ) : (
                        <button
                            className="btn-sync"
                            onClick={() => syncMotorsFromAPI()}
                            title="Fetch latest motors from ThrustCurve.org"
                        >
                            🔄 Sync from ThrustCurve.org
                        </button>
                    )}
                    {motorSyncStatus === 'error' && motorSyncError && (
                        <span className="sync-error">⚠️ {motorSyncError}</span>
                    )}
                </div>

                <div className="motor-selector-content">
                    {/* Filters */}
                    <div className="motor-filters">
                        <div className="filter-row">
                            <div className="filter-group">
                                <label>Search</label>
                                <input type="text" placeholder="Search motors..." value={search}
                                    onChange={e => setSearch(e.target.value)} />
                            </div>
                            <div className="filter-group">
                                <label>Class</label>
                                <select value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                                    <option value="all">All Classes</option>
                                    {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
                                </select>
                            </div>
                            <div className="filter-group">
                                <label>Diameter</label>
                                <select value={filterDiameter} onChange={e => setFilterDiameter(Number(e.target.value))}>
                                    <option value={0}>All Diameters</option>
                                    {diameters.map(d => <option key={d} value={d}>{fmt(d, 'motor_mm', us)} {unitLabel('motor_mm', us)}</option>)}
                                </select>
                            </div>
                            <div className="filter-group">
                                <label>Manufacturer</label>
                                <select value={filterManufacturer} onChange={e => setFilterManufacturer(e.target.value)}>
                                    <option value="all">All Manufacturers</option>
                                    {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="motor-selector-body">
                        {/* Motor list */}
                        <div className="motor-list">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Designation</th>
                                        <th>Manufacturer</th>
                                        <th>Ø ({unitLabel('motor_mm', us)})</th>
                                        <th>Length</th>
                                        <th>Total Impulse</th>
                                        <th>Avg Thrust</th>
                                        <th>Max Thrust</th>
                                        <th>Burn</th>
                                        <th>Mass</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMotors.map(motor => (
                                        <tr
                                            key={motor.designation}
                                            className={`motor-row ${selectedPreview?.designation === motor.designation ? 'selected' : ''}`}
                                            onClick={() => setSelectedPreview(motor)}
                                            onDoubleClick={() => { setSelectedMotor(motor); setShowMotorSelector(false); }}
                                        >
                                            <td className="motor-designation">{motor.designation}</td>
                                            <td>{motor.manufacturer}</td>
                                            <td>{fmt(motor.diameter, 'motor_mm', us)}</td>
                                            <td>{fmt(motor.length, 'motor_mm', us)}{unitLabel('motor_mm', us)}</td>
                                            <td>{fmtU(motor.totalImpulse, 'Ns', us)}</td>
                                            <td>{fmtU(motor.averageThrust, 'N', us)}</td>
                                            <td>{fmtU(motor.maxThrust, 'N', us)}</td>
                                            <td>{motor.burnTime.toFixed(2)}s</td>
                                            <td>{fmtU(motor.totalMass, 'g', us)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredMotors.length === 0 && (
                                <p className="no-motors">No motors match the current filters.</p>
                            )}
                        </div>

                        {/* Motor preview */}
                        {selectedPreview && (
                            <div className="motor-preview">
                                <h3>{selectedPreview.designation}</h3>
                                <p className="motor-mfg">{selectedPreview.manufacturer}</p>

                                <div className="motor-specs">
                                    <div className="spec">
                                        <span className="spec-label">Class</span>
                                        <span className="spec-value">{selectedPreview.impulseClass}</span>
                                    </div>
                                    <div className="spec">
                                        <span className="spec-label">Diameter</span>
                                        <span className="spec-value">{fmt(selectedPreview.diameter, 'motor_mm', us)} {unitLabel('motor_mm', us)}</span>
                                    </div>
                                    <div className="spec">
                                        <span className="spec-label">Length</span>
                                        <span className="spec-value">{fmt(selectedPreview.length, 'motor_mm', us)} {unitLabel('motor_mm', us)}</span>
                                    </div>
                                    <div className="spec">
                                        <span className="spec-label">Total Impulse</span>
                                        <span className="spec-value">{fmtU(selectedPreview.totalImpulse, 'Ns', us)}</span>
                                    </div>
                                    <div className="spec">
                                        <span className="spec-label">Average Thrust</span>
                                        <span className="spec-value">{fmtU(selectedPreview.averageThrust, 'N', us)}</span>
                                    </div>
                                    <div className="spec">
                                        <span className="spec-label">Max Thrust</span>
                                        <span className="spec-value">{fmtU(selectedPreview.maxThrust, 'N', us)}</span>
                                    </div>
                                    <div className="spec">
                                        <span className="spec-label">Burn Time</span>
                                        <span className="spec-value">{selectedPreview.burnTime.toFixed(2)} s</span>
                                    </div>
                                    <div className="spec">
                                        <span className="spec-label">Propellant Mass</span>
                                        <span className="spec-value">{fmtU(selectedPreview.propellantMass, 'g', us)}</span>
                                    </div>
                                    <div className="spec">
                                        <span className="spec-label">Total Mass</span>
                                        <span className="spec-value">{fmtU(selectedPreview.totalMass, 'g', us)}</span>
                                    </div>
                                    <div className="spec">
                                        <span className="spec-label">Delays</span>
                                        <span className="spec-value">{selectedPreview.delays}s</span>
                                    </div>
                                </div>

                                {/* Thrust curve */}
                                <div className="thrust-curve">
                                    <h4>Thrust Curve</h4>
                                    {loadingCurve ? (
                                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#5c6370' }}>
                                            ⏳ Downloading thrust curve…
                                        </div>
                                    ) : thrustData.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#5c6370' }}>
                                            No thrust curve data available yet.
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={200}>
                                            <LineChart data={thrustData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                                <XAxis dataKey="time" label={{ value: 'Time (s)', position: 'insideBottomRight', offset: -5 }} />
                                                <YAxis label={{ value: `Thrust (${unitLabel('N', us)})`, angle: -90, position: 'insideLeft' }} />
                                                <Tooltip formatter={(v: number) => [`${v.toFixed(2)} ${unitLabel('N', us)}`, 'Thrust']}
                                                    labelFormatter={(l: number) => `t = ${l.toFixed(3)}s`} />
                                                <Line type="monotone" dataKey="thrust" stroke="#ff5722" dot={false} strokeWidth={2} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn-cancel" onClick={() => setShowMotorSelector(false)}>Cancel</button>
                    <button className="btn-select" onClick={handleSelect} disabled={!selectedPreview}>
                        Select {selectedPreview?.designation || 'Motor'}
                    </button>
                </div>
            </div>
        </div>
    );
};
