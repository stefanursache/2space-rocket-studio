import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { fmt, fmtU, unitLabel } from '../utils/units';

export const StabilityInfo: React.FC = () => {
    const { stability, rocket, selectedMotor, unitSystem: us } = useStore();
    const [positionReference, setPositionReference] = useState<'top' | 'bottom'>('top');
    const [percentMode, setPercentMode] = useState<'length' | 'target'>('length');

    if (!stability) return null;

    const fromBottom = positionReference === 'bottom';
    const refLabel = fromBottom ? 'tail' : 'nose';
    const cgDisplay = fromBottom ? (stability.totalLength - stability.cg) : stability.cg;
    const cpDisplay = fromBottom ? (stability.totalLength - stability.cp) : stability.cp;
    const cgLeft = stability.totalLength > 0
        ? (fromBottom ? (1 - stability.cg / stability.totalLength) : (stability.cg / stability.totalLength)) * 100
        : 0;
    const cpLeft = stability.totalLength > 0
        ? (fromBottom ? (1 - stability.cp / stability.totalLength) : (stability.cp / stability.totalLength)) * 100
        : 0;
    const stabilityPercentLength = stability.totalLength > 0
        ? ((stability.cp - stability.cg) / stability.totalLength) * 100
        : 0;
    const stabilityPercentTarget = stability.stabilityMargin * 100;
    const stabilityPercent = percentMode === 'length' ? stabilityPercentLength : stabilityPercentTarget;
    const stabilityPercentLabel = percentMode === 'length' ? '% L' : '% 1cal';

    const marginClass =
        stability.stabilityMargin < 1.0 ? 'unstable' :
            stability.stabilityMargin < 1.5 ? 'marginal' :
                stability.stabilityMargin > 3.0 ? 'overstable' : 'stable';

    const marginLabel =
        stability.stabilityMargin < 1.0 ? 'UNSTABLE' :
            stability.stabilityMargin < 1.5 ? 'MARGINAL' :
                stability.stabilityMargin > 3.0 ? 'OVERSTABLE' : 'STABLE';

    return (
        <div className="stability-info">
            <h3>Stability & Flight Data</h3>

            <div className="stability-ref-toggle">
                <button
                    className={`stability-ref-btn ${!fromBottom ? 'active' : ''}`}
                    onClick={() => setPositionReference('top')}
                    title="Measure CG/CP from rocket nose"
                >
                    From Top (Nose)
                </button>
                <button
                    className={`stability-ref-btn ${fromBottom ? 'active' : ''}`}
                    onClick={() => setPositionReference('bottom')}
                    title="Measure CG/CP from rocket tail"
                >
                    From Bottom (Tail)
                </button>
            </div>

            <div className="stability-ref-toggle">
                <button
                    className={`stability-ref-btn ${percentMode === 'length' ? 'active' : ''}`}
                    onClick={() => setPercentMode('length')}
                    title="Stability as percent of total rocket length"
                >
                    % of Length
                </button>
                <button
                    className={`stability-ref-btn ${percentMode === 'target' ? 'active' : ''}`}
                    onClick={() => setPercentMode('target')}
                    title="Stability as percent of a 1-caliber target"
                >
                    % of 1-cal Target
                </button>
            </div>

            <div className={`stability-indicator ${marginClass}`}>
                <div className="stability-margin">
                    <span className="margin-value">{stability.stabilityMargin.toFixed(2)}</span>
                    <span className="margin-unit">cal</span>
                </div>
                <div className="stability-percent">{stabilityPercent.toFixed(1)} {stabilityPercentLabel}</div>
                <span className="stability-label">{marginLabel}</span>
            </div>

            <div className="stability-diagram">
                <div className="rocket-line">
                    <div className="length-bar" />
                    {stability.totalLength > 0 && (
                        <>
                            <div
                                className="cg-marker"
                                style={{ left: `${cgLeft}%` }}
                                title={`CG: ${fmtU(cgDisplay, 'cm', us)} from ${refLabel}`}
                            >
                                <div className="marker-dot cg-dot" />
                                <span className="marker-label">CG</span>
                            </div>
                            <div
                                className="cp-marker"
                                style={{ left: `${cpLeft}%` }}
                                title={`CP: ${fmtU(cpDisplay, 'cm', us)} from ${refLabel}`}
                            >
                                <div className="marker-dot cp-dot" />
                                <span className="marker-label">CP</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="info-grid">
                <div className="info-item">
                    <span className="info-label">Total Length</span>
                    <span className="info-value">{fmtU(stability.totalLength, 'cm', us)}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Max Diameter</span>
                    <span className="info-value">{fmtU(stability.referenceLength, 'cm', us, 2)}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Total Mass</span>
                    <span className="info-value">{fmtU(stability.totalMass, 'g', us)}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">CG ({fromBottom ? 'from tail' : 'from nose'})</span>
                    <span className="info-value">{fmtU(cgDisplay, 'cm', us, 2)}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">CP ({fromBottom ? 'from tail' : 'from nose'})</span>
                    <span className="info-value">{fmtU(cpDisplay, 'cm', us, 2)}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Stability</span>
                    <span className={`info-value ${marginClass}`}>{stability.stabilityMargin.toFixed(2)} cal</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Stability (%)</span>
                    <span className={`info-value ${marginClass}`}>{stabilityPercent.toFixed(2)} {stabilityPercentLabel}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">CNα</span>
                    <span className="info-value">{stability.cnAlpha.toFixed(3)}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Ref. Area</span>
                    <span className="info-value">{fmtU(stability.referenceArea, 'cm2', us)}</span>
                </div>
                {selectedMotor && (
                    <>
                        <div className="info-item">
                            <span className="info-label">Motor</span>
                            <span className="info-value">{selectedMotor.designation}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Total Impulse</span>
                            <span className="info-value">{fmtU(selectedMotor.totalImpulse, 'Ns', us)}</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
