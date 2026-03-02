import React from 'react';
import { useStore } from '../store/useStore';

export const StabilityInfo: React.FC = () => {
    const { stability, rocket, selectedMotor } = useStore();

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
                                title={`CG: ${(stability.cg * 100).toFixed(1)} cm from nose`}
                            >
                                <div className="marker-dot cg-dot" />
                                <span className="marker-label">CG</span>
                            </div>
                            <div
                                className="cp-marker"
                                style={{ left: `${(stability.cp / stability.totalLength) * 100}%` }}
                                title={`CP: ${(stability.cp * 100).toFixed(1)} cm from nose`}
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
                    <span className="info-value">{(stability.totalLength * 100).toFixed(1)} cm</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Max Diameter</span>
                    <span className="info-value">{(stability.referenceLength * 100).toFixed(2)} cm</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Total Mass</span>
                    <span className="info-value">{(stability.totalMass * 1000).toFixed(1)} g</span>
                </div>
                <div className="info-item">
                    <span className="info-label">CG Location</span>
                    <span className="info-value">{(stability.cg * 100).toFixed(2)} cm</span>
                </div>
                <div className="info-item">
                    <span className="info-label">CP Location</span>
                    <span className="info-value">{(stability.cp * 100).toFixed(2)} cm</span>
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
                    <span className="info-value">{(stability.referenceArea * 1e4).toFixed(3)} cm²</span>
                </div>
                {selectedMotor && (
                    <>
                        <div className="info-item">
                            <span className="info-label">Motor</span>
                            <span className="info-value">{selectedMotor.designation}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Total Impulse</span>
                            <span className="info-value">{selectedMotor.totalImpulse.toFixed(1)} Ns</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
