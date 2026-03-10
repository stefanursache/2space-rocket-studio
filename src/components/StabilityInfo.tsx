import React from 'react';
import { useStore } from '../store/useStore';
import { fmt, fmtU, unitLabel } from '../utils/units';

export const StabilityInfo: React.FC = () => {
    const { stability, rocket, selectedMotor, unitSystem: us } = useStore();

    if (!stability) return null;

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

            <div className={`stability-indicator ${marginClass}`}>
                <div className="stability-margin">
                    <span className="margin-value">{stability.stabilityMargin.toFixed(2)}</span>
                    <span className="margin-unit">cal</span>
                </div>
                <span className="stability-label">{marginLabel}</span>
            </div>

            <div className="stability-diagram">
                <div className="rocket-line">
                    <div className="length-bar" />
                    {stability.totalLength > 0 && (
                        <>
                            <div
                                className="cg-marker"
                                style={{ left: `${(stability.cg / stability.totalLength) * 100}%` }}
                                title={`CG: ${fmtU(stability.cg, 'cm', us)} from nose`}
                            >
                                <div className="marker-dot cg-dot" />
                                <span className="marker-label">CG</span>
                            </div>
                            <div
                                className="cp-marker"
                                style={{ left: `${(stability.cp / stability.totalLength) * 100}%` }}
                                title={`CP: ${fmtU(stability.cp, 'cm', us)} from nose`}
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
                    <span className="info-label">CG Location</span>
                    <span className="info-value">{fmtU(stability.cg, 'cm', us, 2)}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">CP Location</span>
                    <span className="info-value">{fmtU(stability.cp, 'cm', us, 2)}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Stability</span>
                    <span className={`info-value ${marginClass}`}>{stability.stabilityMargin.toFixed(2)} cal</span>
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
