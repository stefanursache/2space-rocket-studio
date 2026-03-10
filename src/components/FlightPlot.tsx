import React, { useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts';
import { SimulationResult } from '../types/rocket';
import { useStore } from '../store/useStore';
import { toDisplay, unitLabel, UnitSystem } from '../utils/units';

interface FlightPlotProps {
    result: SimulationResult;
}

type PlotType = 'altitude' | 'velocity' | 'acceleration' | 'drag' | 'mach' | 'thrust' | 'mass' | 'all';

export const FlightPlot: React.FC<FlightPlotProps> = ({ result }) => {
    const [plotType, setPlotType] = useState<PlotType>('altitude');
    const us = useStore(s => s.unitSystem);

    // Downsample data for performance if needed
    const rawData = result.data;
    const data = rawData.length > 500
        ? rawData.filter((_, i) => i % Math.ceil(rawData.length / 500) === 0 || i === rawData.length - 1)
        : rawData;

    const plotData = data.map(dp => ({
        time: parseFloat(dp.time.toFixed(3)),
        altitude: parseFloat(toDisplay(dp.altitude, 'm_alt', us).toFixed(2)),
        velocity: parseFloat(toDisplay(dp.velocity, 'mps', us).toFixed(2)),
        verticalVelocity: parseFloat(toDisplay(dp.velocityY, 'mps', us).toFixed(2)),
        horizontalVelocity: parseFloat(toDisplay(Math.sqrt(dp.velocityX ** 2 + dp.velocityZ ** 2), 'mps', us).toFixed(2)),
        acceleration: parseFloat(toDisplay(dp.acceleration, 'mps2', us).toFixed(2)),
        mach: parseFloat(dp.machNumber.toFixed(4)),
        drag: parseFloat(toDisplay(dp.dragForce, 'N', us).toFixed(3)),
        thrust: parseFloat(toDisplay(dp.thrustForce, 'N', us).toFixed(3)),
        mass: parseFloat(toDisplay(dp.totalMass, 'g', us).toFixed(1)),
        cd: parseFloat(dp.cd.toFixed(4)),
        dynamicPressure: parseFloat(dp.dynamicPressure.toFixed(2)),
    }));

    // Find event times for markers
    const apogeeEvent = result.events.find(e => e.type === 'apogee');
    const burnoutEvent = result.events.find(e => e.type === 'burnout');
    const recoveryEvent = result.events.find(e => e.type === 'deployment');
    const launchRodEvent = result.events.find(e => e.type === 'launchrod');
    const aU = unitLabel('m_alt', us);
    const vU = unitLabel('mps', us);
    const accU = unitLabel('mps2', us);
    const fU = unitLabel('N', us);
    const mU = unitLabel('g', us);
    const plotConfigs: Record<string, any> = {
        altitude: {
            title: 'Altitude vs Time',
            lines: [
                { key: 'altitude', color: '#2196F3', name: `Altitude (${aU})`, unit: aU }
            ],
            yLabel: `Altitude (${aU})`
        },
        velocity: {
            title: 'Velocity vs Time',
            lines: [
                { key: 'velocity', color: '#4CAF50', name: `Total Velocity (${vU})`, unit: vU },
                { key: 'verticalVelocity', color: '#FF9800', name: `Vertical Velocity (${vU})`, unit: vU },
            ],
            yLabel: `Velocity (${vU})`
        },
        acceleration: {
            title: 'Acceleration vs Time',
            lines: [
                { key: 'acceleration', color: '#f44336', name: `Acceleration (${accU})`, unit: accU }
            ],
            yLabel: `Acceleration (${accU})`
        },
        drag: {
            title: 'Drag & Dynamic Pressure vs Time',
            lines: [
                { key: 'drag', color: '#9C27B0', name: `Drag Force (${fU})`, unit: fU },
                { key: 'cd', color: '#FF5722', name: 'Drag Coefficient', unit: '' },
            ],
            yLabel: `Force (${fU}) / Cd`
        },
        mach: {
            title: 'Mach Number vs Time',
            lines: [
                { key: 'mach', color: '#E91E63', name: 'Mach Number', unit: '' }
            ],
            yLabel: 'Mach Number'
        },
        thrust: {
            title: 'Thrust vs Time',
            lines: [
                { key: 'thrust', color: '#FF5722', name: `Thrust (${fU})`, unit: fU }
            ],
            yLabel: `Thrust (${fU})`
        },
        mass: {
            title: 'Mass vs Time',
            lines: [
                { key: 'mass', color: '#795548', name: `Total Mass (${mU})`, unit: mU }
            ],
            yLabel: `Mass (${mU})`
        },
        all: {
            title: 'Combined Flight Data',
            lines: [
                { key: 'altitude', color: '#2196F3', name: `Altitude (${aU})`, unit: aU },
                { key: 'velocity', color: '#4CAF50', name: `Velocity (${vU})`, unit: vU },
                { key: 'acceleration', color: '#f44336', name: `Acceleration (${accU})`, unit: accU },
            ],
            yLabel: 'Value'
        },
    };

    const config = plotConfigs[plotType];

    return (
        <div className="flight-plot">
            <div className="plot-tabs">
                {Object.entries(plotConfigs).map(([key, cfg]) => (
                    <button
                        key={key}
                        className={`plot-tab ${plotType === key ? 'active' : ''}`}
                        onClick={() => setPlotType(key as PlotType)}
                    >
                        {(cfg as any).title.replace(' vs Time', '').replace('Combined ', '')}
                    </button>
                ))}
            </div>

            <div className="plot-container">
                <h4>{config.title}</h4>
                <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={plotData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2d323a" />
                        <XAxis
                            dataKey="time"
                            label={{ value: 'Time (s)', position: 'insideBottomRight', offset: -5, fill: '#8b919c' }}
                            tickFormatter={(v: number) => v.toFixed(1)}
                            stroke="#3a3f48"
                            tick={{ fill: '#8b919c', fontSize: 11 }}
                        />
                        <YAxis
                            label={{ value: config.yLabel, angle: -90, position: 'insideLeft', offset: -5, fill: '#8b919c' }}
                            stroke="#3a3f48"
                            tick={{ fill: '#8b919c', fontSize: 11 }}
                            domain={['auto', 'auto']}
                        />
                        <Tooltip
                            formatter={(value: number, name: string) => [value.toFixed(2), name]}
                            labelFormatter={(label: number) => `t = ${label.toFixed(3)} s`}
                            contentStyle={{ backgroundColor: '#282c34', border: '1px solid #3a3f48', borderRadius: '4px', color: '#ced4de' }}
                            labelStyle={{ color: '#8b919c' }}
                        />
                        <Legend wrapperStyle={{ color: '#8b919c' }} />

                        {config.lines.map((line: any) => (
                            <Line
                                key={line.key}
                                type="monotone"
                                dataKey={line.key}
                                stroke={line.color}
                                name={line.name}
                                dot={false}
                                strokeWidth={2}
                            />
                        ))}

                        {/* Event markers */}
                        {burnoutEvent && (
                            <ReferenceLine x={parseFloat(burnoutEvent.time.toFixed(3))} stroke="#FF9800"
                                strokeDasharray="3 3" label={{ value: 'Burnout', position: 'top', fontSize: 10, fill: '#FF9800' }} />
                        )}
                        {apogeeEvent && (
                            <ReferenceLine x={parseFloat(apogeeEvent.time.toFixed(3))} stroke="#4CAF50"
                                strokeDasharray="3 3" label={{ value: 'Apogee', position: 'top', fontSize: 10, fill: '#4CAF50' }} />
                        )}
                        {recoveryEvent && (
                            <ReferenceLine x={parseFloat(recoveryEvent.time.toFixed(3))} stroke="#2196F3"
                                strokeDasharray="3 3" label={{ value: 'Recovery', position: 'top', fontSize: 10, fill: '#2196F3' }} />
                        )}
                        {launchRodEvent && (
                            <ReferenceLine x={parseFloat(launchRodEvent.time.toFixed(3))} stroke="#9E9E9E"
                                strokeDasharray="3 3" label={{ value: 'Off Rod', position: 'insideTopLeft', fontSize: 9, fill: '#9E9E9E' }} />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Data export */}
            <div className="plot-actions">
                <button className="export-btn" onClick={() => exportCSV(result, us)}>
                    ↓ Export CSV
                </button>
                <span className="data-points-count">{result.data.length} data points</span>
            </div>
        </div>
    );
};

function exportCSV(result: SimulationResult, us: UnitSystem) {
    const aU = unitLabel('m_alt', us);
    const vU = unitLabel('mps', us);
    const accU = unitLabel('mps2', us);
    const fU = unitLabel('N', us);
    const mU = unitLabel('g', us);
    const headers = [`Time (s)`, `Altitude (${aU})`, `Velocity (${vU})`, `Vertical Velocity (${vU})`,
        `Acceleration (${accU})`, 'Mach', `Thrust (${fU})`, `Drag (${fU})`, `Mass (${mU})`,
        'Cd', 'Dynamic Pressure (Pa)'];
    const rows = result.data.map(dp =>
        [dp.time, toDisplay(dp.altitude, 'm_alt', us).toFixed(2),
        toDisplay(dp.velocity, 'mps', us).toFixed(2), toDisplay(dp.velocityY, 'mps', us).toFixed(2),
        toDisplay(dp.acceleration, 'mps2', us).toFixed(2), dp.machNumber,
        toDisplay(dp.thrustForce, 'N', us).toFixed(3), toDisplay(dp.dragForce, 'N', us).toFixed(3),
        toDisplay(dp.totalMass, 'g', us).toFixed(1),
        dp.cd, dp.dynamicPressure].join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation_${result.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
