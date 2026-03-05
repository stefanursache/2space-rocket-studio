import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { RocketComponent, NoseCone, BodyTube, Transition, TrapezoidFinSet, EllipticalFinSet, FreeformFinSet, InnerTube, Parachute, Streamer, LaunchLug, MassObject, ShockCord, EngineBlock, CenteringRing, Bulkhead, Airbrakes } from '../types/rocket';
import { BULK_MATERIALS, SURFACE_MATERIALS, LINE_MATERIALS } from '../models/materials';
import { FreeformFinEditor } from './FreeformFinEditor';

/** Find parent container length, absolute start position from nose tip, and parent radius */
function getParentInfo(rocket: any, childId: string): { parentLength: number; parentStart: number; parentRadius: number } {
    let xPos = 0;
    for (const stage of rocket.stages) {
        xPos = 0;
        for (const comp of stage.components) {
            const cLen = comp.type === 'nosecone' ? comp.length
                : comp.type === 'bodytube' ? comp.length
                    : comp.type === 'transition' ? comp.length : 0;
            if (comp.type === 'bodytube' && comp.children) {
                for (const child of comp.children) {
                    if (child.id === childId) return { parentLength: comp.length, parentStart: xPos, parentRadius: comp.outerRadius || 0 };
                    if (child.type === 'innertube' && child.children) {
                        for (const gc of child.children) {
                            if (gc.id === childId) {
                                const itPos = typeof child.position === 'number' ? child.position : 0;
                                return { parentLength: child.length, parentStart: xPos + itPos, parentRadius: child.outerRadius || 0 };
                            }
                        }
                    }
                }
            }
            xPos += cLen;
        }
    }
    return { parentLength: 0, parentStart: 0, parentRadius: 0 };
}

export const ComponentEditor: React.FC = () => {
    const { selectedComponentId, rocket, updateComponent, showComponentEditor } = useStore();

    if (!showComponentEditor || !selectedComponentId) {
        return (
            <div className="component-editor">
                <div className="editor-empty">
                    <p>Select a component to edit its properties</p>
                </div>
            </div>
        );
    }

    // Find the component
    let component: RocketComponent | null = null;
    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            if (comp.id === selectedComponentId) { component = comp; break; }
            if (comp.type === 'bodytube' && comp.children) {
                for (const child of comp.children) {
                    if (child.id === selectedComponentId) { component = child; break; }
                    if (child.type === 'innertube' && child.children) {
                        for (const gc of child.children) {
                            if (gc.id === selectedComponentId) { component = gc; break; }
                        }
                    }
                }
            }
        }
        if (component) break;
    }

    if (!component) {
        return <div className="component-editor"><p>Component not found</p></div>;
    }

    const update = (updates: Partial<RocketComponent>) => {
        updateComponent(selectedComponentId, updates);
    };

    const mmToM = (mm: number) => mm / 1000;
    const mToMm = (m: number) => m * 1000;

    const parentInfo = 'position' in component
        ? getParentInfo(rocket, selectedComponentId)
        : { parentLength: 0, parentStart: 0, parentRadius: 0 };

    return (
        <div className="component-editor">
            <h3 className="editor-title">
                <span style={{ color: component.color }}>●</span> {component.name}
            </h3>

            {/* Common properties */}
            <div className="editor-section">
                <h4>General</h4>
                <div className="field">
                    <label>Name</label>
                    <input
                        type="text"
                        value={component.name}
                        onChange={e => update({ name: e.target.value })}
                    />
                </div>
                <div className="field">
                    <label>Color</label>
                    <input
                        type="color"
                        value={component.color}
                        onChange={e => update({ color: e.target.value })}
                    />
                </div>
                <div className="field">
                    <label>Comment</label>
                    <textarea
                        value={component.comment}
                        onChange={e => update({ comment: e.target.value })}
                        rows={2}
                    />
                </div>
            </div>

            {/* Type-specific properties */}
            {component.type === 'nosecone' && <NoseConeEditor comp={component} update={update} />}
            {component.type === 'bodytube' && <BodyTubeEditor comp={component} update={update} />}
            {component.type === 'transition' && <TransitionEditor comp={component} update={update} />}
            {component.type === 'trapezoidfinset' && <TrapFinEditor comp={component} update={update} />}
            {component.type === 'ellipticalfinset' && <EllipFinEditor comp={component} update={update} />}
            {component.type === 'freeformfinset' && <FreeformFinEditor comp={component as FreeformFinSet} update={update} />}
            {component.type === 'innertube' && <InnerTubeEditor comp={component} update={update} />}
            {component.type === 'parachute' && <ParachuteEditor comp={component} update={update} />}
            {component.type === 'streamer' && <StreamerEditor comp={component} update={update} />}
            {component.type === 'launchlug' && <LaunchLugEditor comp={component} update={update} />}
            {component.type === 'massobject' && <MassEditor comp={component} update={update} />}
            {component.type === 'shockcord' && <ShockCordEditor comp={component} update={update} />}
            {component.type === 'engineblock' && <EngineBlockEditor comp={component} update={update} />}
            {component.type === 'centeringring' && <CenteringRingEditor comp={component} update={update} />}
            {component.type === 'bulkhead' && <BulkheadEditor comp={component} update={update} />}
            {component.type === 'airbrakes' && <AirbrakesEditor comp={component} update={update} parentRadius={parentInfo.parentRadius} />}

            {/* Position section for child components */}
            {'position' in component && (
                <div className="editor-section">
                    <h4>Position</h4>
                    <div className="position-ref-toggle">
                        <span className="position-ref-label">Lock to:</span>
                        <button
                            className={`ref-btn ${(component.positionReference || 'front') === 'front' ? 'active' : ''}`}
                            onClick={() => update({ positionReference: 'front' } as any)}
                            title="Position measured from parent front (nose-side)"
                        >⬅ Front</button>
                        <button
                            className={`ref-btn ${component.positionReference === 'back' ? 'active' : ''}`}
                            onClick={() => {
                                const curPos = (component as any).position;
                                const newPos = parentInfo.parentLength - curPos;
                                update({ positionReference: 'back', position: newPos } as any);
                            }}
                            title="Position measured from parent aft (tail-side)"
                        >Aft ➡</button>
                    </div>
                    {parentInfo.parentLength > 0 && (
                        <div className="position-slider-wrapper">
                            <input
                                type="range"
                                className="position-slider"
                                min={0}
                                max={parentInfo.parentLength * 1000}
                                step={0.5}
                                value={(component as any).position * 1000}
                                onChange={e => update({ position: parseFloat(e.target.value) / 1000 } as any)}
                            />
                            <div className="position-slider-range">
                                <span>0 (front)</span>
                                <span>{(parentInfo.parentLength * 1000).toFixed(0)} mm (aft)</span>
                            </div>
                        </div>
                    )}
                    <NumField label={`From parent ${(component.positionReference || 'front') === 'front' ? 'front' : 'aft'}`} value={(component as any).position * 1000} onChange={v => update({ position: v / 1000 } as any)} step={1} unit="mm" />
                    <div className="position-info">
                        📍 From nose tip: <strong>{((parentInfo.parentStart + (component as any).position) * 1000).toFixed(1)} mm</strong>
                    </div>
                    {'radialAngle' in component && (
                        <NumField label="Radial Angle" value={(component as any).radialAngle} onChange={v => update({ radialAngle: v } as any)} unit="°" step={5} />
                    )}
                </div>
            )}

            {/* Material */}
            <MaterialEditor component={component} update={update} />

            {/* Mass override */}
            <div className="editor-section">
                <h4>Overrides</h4>
                <div className="field checkbox-field">
                    <label>
                        <input
                            type="checkbox"
                            checked={component.massOverridden}
                            onChange={e => update({ massOverridden: e.target.checked })}
                        />
                        Override mass
                    </label>
                </div>
                {component.massOverridden && (
                    <div className="field">
                        <label>Mass (g)</label>
                        <input
                            type="number"
                            step="0.1"
                            value={((component.mass || 0) * 1000).toFixed(1)}
                            onChange={e => update({ mass: parseFloat(e.target.value) / 1000 })}
                        />
                    </div>
                )}
                <div className="field checkbox-field">
                    <label>
                        <input
                            type="checkbox"
                            checked={component.cgOverridden}
                            onChange={e => update({ cgOverridden: e.target.checked })}
                        />
                        Override CG
                    </label>
                </div>
                <div className="field checkbox-field">
                    <label>
                        <input
                            type="checkbox"
                            checked={component.cdOverridden}
                            onChange={e => update({ cdOverridden: e.target.checked })}
                        />
                        Override CD
                    </label>
                </div>
            </div>
        </div>
    );
};

const NumField: React.FC<{
    label: string;
    value: number;
    onChange: (v: number) => void;
    step?: number;
    min?: number;
    max?: number;
    unit?: string;
}> = ({ label, value, onChange, step = 0.1, min, max, unit = 'mm' }) => {
    const decimals = unit === 'mm' ? 1 : 2;
    const [localVal, setLocalVal] = useState(value.toFixed(decimals));
    const [editing, setEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync from parent when not editing
    useEffect(() => {
        if (!editing) {
            setLocalVal(value.toFixed(decimals));
        }
    }, [value, decimals, editing]);

    const commit = () => {
        setEditing(false);
        const parsed = parseFloat(localVal);
        if (!isNaN(parsed)) {
            let clamped = parsed;
            if (min !== undefined) clamped = Math.max(min, clamped);
            if (max !== undefined) clamped = Math.min(max, clamped);
            onChange(clamped);
        } else {
            // Reset to current value if invalid
            setLocalVal(value.toFixed(decimals));
        }
    };

    return (
        <div className="field">
            <label>{label} ({unit})</label>
            <input
                ref={inputRef}
                type="number"
                step={step}
                min={min}
                max={max}
                value={localVal}
                onFocus={() => {
                    setEditing(true);
                    // Select all text on focus for easy replacement
                    setTimeout(() => inputRef.current?.select(), 0);
                }}
                onChange={e => setLocalVal(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                    if (e.key === 'Enter') {
                        commit();
                        inputRef.current?.blur();
                    }
                    if (e.key === 'Escape') {
                        setEditing(false);
                        setLocalVal(value.toFixed(decimals));
                        inputRef.current?.blur();
                    }
                }}
            />
        </div>
    );
};

// Material editor
const MaterialEditor: React.FC<{ component: RocketComponent; update: (u: any) => void }> = ({ component, update }) => {
    const materials = component.material.type === 'surface'
        ? SURFACE_MATERIALS
        : component.material.type === 'line'
            ? LINE_MATERIALS
            : BULK_MATERIALS;

    return (
        <div className="editor-section">
            <h4>Material & Finish</h4>
            <div className="field">
                <label>Material</label>
                <select
                    value={component.material.name}
                    onChange={e => {
                        const mat = materials.find(m => m.name === e.target.value);
                        if (mat) update({ material: mat });
                    }}
                >
                    {materials.map(m => (
                        <option key={m.name} value={m.name}>
                            {m.name} ({m.density} {m.type === 'bulk' ? 'kg/m³' : m.type === 'surface' ? 'kg/m²' : 'kg/m'})
                        </option>
                    ))}
                </select>
            </div>
            <div className="field">
                <label>Surface Finish</label>
                <select
                    value={component.finish}
                    onChange={e => update({ finish: e.target.value })}
                >
                    <option value="unfinished">Unfinished</option>
                    <option value="rough">Rough</option>
                    <option value="unfinished_paint">Unfinished Paint</option>
                    <option value="regular_paint">Regular Paint</option>
                    <option value="smooth_paint">Smooth Paint</option>
                    <option value="polished">Polished</option>
                </select>
            </div>
        </div>
    );
};

// === Nose Cone Editor ===
const NoseConeEditor: React.FC<{ comp: NoseCone; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Nose Cone Dimensions</h4>
        <div className="field">
            <label>Shape</label>
            <select value={comp.shape} onChange={e => update({ shape: e.target.value })}>
                <option value="conical">Conical</option>
                <option value="ogive">Ogive</option>
                <option value="ellipsoid">Ellipsoid</option>
                <option value="power">Power Series</option>
                <option value="parabolic">Parabolic</option>
                <option value="haack">Haack Series (LD-Haack)</option>
            </select>
        </div>
        {(comp.shape === 'power' || comp.shape === 'parabolic') && (
            <NumField label="Shape Parameter" value={comp.shapeParameter} onChange={v => update({ shapeParameter: v })} step={0.01} unit="" min={0} max={1} />
        )}
        <NumField label="Length" value={comp.length * 1000} onChange={v => update({ length: v / 1000 })} />
        <NumField label="Base Diameter" value={comp.baseRadius * 2000} onChange={v => update({ baseRadius: v / 2000 })} />
        <NumField label="Thickness" value={comp.thickness * 1000} onChange={v => update({ thickness: v / 1000 })} />
        <NumField label="Shoulder Length" value={comp.shoulderLength * 1000} onChange={v => update({ shoulderLength: v / 1000 })} />
        <NumField label="Shoulder Diameter" value={comp.shoulderRadius * 2000} onChange={v => update({ shoulderRadius: v / 2000 })} />
    </div>
);

// === Body Tube Editor ===
const BodyTubeEditor: React.FC<{ comp: BodyTube; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Body Tube Dimensions</h4>
        <NumField label="Length" value={comp.length * 1000} onChange={v => update({ length: v / 1000 })} />
        <NumField label="Outer Diameter" value={comp.outerRadius * 2000} onChange={v => update({ outerRadius: v / 2000 })} />
        <NumField label="Inner Diameter" value={comp.innerRadius * 2000} onChange={v => update({ innerRadius: v / 2000 })} />
        <NumField label="Wall Thickness" value={(comp.outerRadius - comp.innerRadius) * 1000} onChange={v => update({ innerRadius: comp.outerRadius - v / 1000 })} />
        <div className="field checkbox-field">
            <label>
                <input type="checkbox" checked={comp.isMotorMount} onChange={e => update({ isMotorMount: e.target.checked })} />
                Motor mount
            </label>
        </div>
        {comp.isMotorMount && (
            <NumField label="Motor Overhang" value={comp.motorOverhang * 1000} onChange={v => update({ motorOverhang: v / 1000 })} />
        )}
    </div>
);

// === Transition Editor ===
const TransitionEditor: React.FC<{ comp: Transition; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Transition Dimensions</h4>
        <div className="field">
            <label>Shape</label>
            <select value={comp.shape} onChange={e => update({ shape: e.target.value })}>
                <option value="conical">Conical</option>
                <option value="ogive">Ogive</option>
                <option value="ellipsoid">Ellipsoid</option>
                <option value="power">Power Series</option>
            </select>
        </div>
        <NumField label="Length" value={comp.length * 1000} onChange={v => update({ length: v / 1000 })} />
        <NumField label="Fore Diameter" value={comp.foreRadius * 2000} onChange={v => update({ foreRadius: v / 2000 })} />
        <NumField label="Aft Diameter" value={comp.aftRadius * 2000} onChange={v => update({ aftRadius: v / 2000 })} />
        <NumField label="Thickness" value={comp.thickness * 1000} onChange={v => update({ thickness: v / 1000 })} />
    </div>
);

// === Trapezoidal Fin Editor ===
const TrapFinEditor: React.FC<{ comp: TrapezoidFinSet; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Trapezoidal Fin Set</h4>
        <div className="field">
            <label>Number of Fins</label>
            <input type="number" min={1} max={8} value={comp.finCount} onChange={e => update({ finCount: parseInt(e.target.value) || 3 })} />
        </div>
        <NumField label="Root Chord" value={comp.rootChord * 1000} onChange={v => update({ rootChord: v / 1000 })} />
        <NumField label="Tip Chord" value={comp.tipChord * 1000} onChange={v => update({ tipChord: v / 1000 })} />
        <NumField label="Height (Span)" value={comp.height * 1000} onChange={v => update({ height: v / 1000 })} />
        <NumField label="Sweep Length" value={comp.sweepLength * 1000} onChange={v => update({ sweepLength: v / 1000 })} />
        <NumField label="Thickness" value={comp.thickness * 1000} onChange={v => update({ thickness: v / 1000 })} />
        <div className="field">
            <label>Cross Section</label>
            <select value={comp.crossSection} onChange={e => update({ crossSection: e.target.value })}>
                <option value="square">Square</option>
                <option value="rounded">Rounded</option>
                <option value="airfoil">Airfoil</option>
                <option value="wedge">Wedge</option>
            </select>
        </div>
        <NumField label="Cant Angle" value={comp.cantAngle} onChange={v => update({ cantAngle: v })} unit="°" />
        <NumField label="Tab Length" value={comp.tabLength * 1000} onChange={v => update({ tabLength: v / 1000 })} />
        <NumField label="Tab Height" value={comp.tabHeight * 1000} onChange={v => update({ tabHeight: v / 1000 })} />
    </div>
);

// === Elliptical Fin Editor ===
const EllipFinEditor: React.FC<{ comp: EllipticalFinSet; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Elliptical Fin Set</h4>
        <div className="field">
            <label>Number of Fins</label>
            <input type="number" min={1} max={8} value={comp.finCount} onChange={e => update({ finCount: parseInt(e.target.value) || 3 })} />
        </div>
        <NumField label="Root Chord" value={comp.rootChord * 1000} onChange={v => update({ rootChord: v / 1000 })} />
        <NumField label="Height (Span)" value={comp.height * 1000} onChange={v => update({ height: v / 1000 })} />
        <NumField label="Thickness" value={comp.thickness * 1000} onChange={v => update({ thickness: v / 1000 })} />
        <div className="field">
            <label>Cross Section</label>
            <select value={comp.crossSection} onChange={e => update({ crossSection: e.target.value })}>
                <option value="square">Square</option>
                <option value="rounded">Rounded</option>
                <option value="airfoil">Airfoil</option>
                <option value="wedge">Wedge</option>
            </select>
        </div>
    </div>
);

// === Inner Tube Editor ===
const InnerTubeEditor: React.FC<{ comp: InnerTube; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Inner Tube Dimensions</h4>
        <NumField label="Length" value={comp.length * 1000} onChange={v => update({ length: v / 1000 })} />
        <NumField label="Outer Diameter" value={comp.outerRadius * 2000} onChange={v => update({ outerRadius: v / 2000 })} />
        <NumField label="Inner Diameter" value={comp.innerRadius * 2000} onChange={v => update({ innerRadius: v / 2000 })} />
        <div className="field checkbox-field">
            <label>
                <input type="checkbox" checked={comp.isMotorMount} onChange={e => update({ isMotorMount: e.target.checked })} />
                This component is a motor mount
            </label>
        </div>
        {comp.isMotorMount && (
            <NumField label="Motor Overhang" value={comp.motorOverhang * 1000} onChange={v => update({ motorOverhang: v / 1000 })} />
        )}
    </div>
);

// === Parachute Editor ===
const ParachuteEditor: React.FC<{ comp: Parachute; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Parachute</h4>
        <NumField label="Diameter" value={comp.diameter * 1000} onChange={v => update({ diameter: v / 1000 })} />
        <NumField label="Drag Coefficient" value={comp.cd} onChange={v => update({ cd: v })} step={0.01} unit="" />
        <div className="field">
            <label>Number of Lines</label>
            <input type="number" min={3} max={24} value={comp.lineCount} onChange={e => update({ lineCount: parseInt(e.target.value) || 6 })} />
        </div>
        <NumField label="Line Length" value={comp.lineLength * 1000} onChange={v => update({ lineLength: v / 1000 })} />
        <div className="field">
            <label>Deploy Event</label>
            <select value={comp.deployEvent} onChange={e => update({ deployEvent: e.target.value })}>
                <option value="apogee">At Apogee</option>
                <option value="altitude">At Altitude</option>
                <option value="timer">Timer</option>
            </select>
        </div>
        {comp.deployEvent === 'altitude' && (
            <NumField label="Deploy Altitude" value={comp.deployAltitude} onChange={v => update({ deployAltitude: v })} unit="m" />
        )}
        <NumField label="Deploy Delay" value={comp.deployDelay} onChange={v => update({ deployDelay: v })} unit="s" />
    </div>
);

// === Streamer Editor ===
const StreamerEditor: React.FC<{ comp: Streamer; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Streamer</h4>
        <NumField label="Length" value={comp.stripLength * 1000} onChange={v => update({ stripLength: v / 1000 })} />
        <NumField label="Width" value={comp.stripWidth * 1000} onChange={v => update({ stripWidth: v / 1000 })} />
        <NumField label="Drag Coefficient" value={comp.cd} onChange={v => update({ cd: v })} step={0.01} unit="" />
        <div className="field">
            <label>Deploy Event</label>
            <select value={comp.deployEvent} onChange={e => update({ deployEvent: e.target.value })}>
                <option value="apogee">At Apogee</option>
                <option value="altitude">At Altitude</option>
                <option value="timer">Timer</option>
            </select>
        </div>
    </div>
);

// === Launch Lug Editor ===
const LaunchLugEditor: React.FC<{ comp: LaunchLug; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Launch Lug</h4>
        <NumField label="Length" value={comp.length * 1000} onChange={v => update({ length: v / 1000 })} />
        <NumField label="Outer Diameter" value={comp.outerRadius * 2000} onChange={v => update({ outerRadius: v / 2000 })} />
        <NumField label="Inner Diameter" value={comp.innerRadius * 2000} onChange={v => update({ innerRadius: v / 2000 })} />
    </div>
);

// === Mass Object Editor ===
const MassEditor: React.FC<{ comp: MassObject; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Mass Component</h4>
        <NumField label="Mass" value={comp.componentMass * 1000} onChange={v => update({ componentMass: v / 1000 })} unit="g" />
        <NumField label="Length" value={comp.length * 1000} onChange={v => update({ length: v / 1000 })} />
        <NumField label="Diameter" value={comp.radius * 2000} onChange={v => update({ radius: v / 2000 })} />
    </div>
);

// === Shock Cord Editor ===
const ShockCordEditor: React.FC<{ comp: ShockCord; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Shock Cord</h4>
        <NumField label="Cord Length" value={comp.cordLength * 1000} onChange={v => update({ cordLength: v / 1000 })} />
    </div>
);

// === Engine Block Editor ===
const EngineBlockEditor: React.FC<{ comp: EngineBlock; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Engine Block</h4>
        <NumField label="Length" value={comp.length * 1000} onChange={v => update({ length: v / 1000 })} />
        <NumField label="Outer Diameter" value={comp.outerRadius * 2000} onChange={v => update({ outerRadius: v / 2000 })} />
        <NumField label="Inner Diameter" value={comp.innerRadius * 2000} onChange={v => update({ innerRadius: v / 2000 })} />
    </div>
);

// === Centering Ring Editor ===
const CenteringRingEditor: React.FC<{ comp: CenteringRing; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Centering Ring</h4>
        <NumField label="Length" value={comp.length * 1000} onChange={v => update({ length: v / 1000 })} />
        <NumField label="Outer Diameter" value={comp.outerRadius * 2000} onChange={v => update({ outerRadius: v / 2000 })} />
        <NumField label="Inner Diameter" value={comp.innerRadius * 2000} onChange={v => update({ innerRadius: v / 2000 })} />
    </div>
);

// === Bulkhead Editor ===
const BulkheadEditor: React.FC<{ comp: Bulkhead; update: (u: any) => void }> = ({ comp, update }) => (
    <div className="editor-section">
        <h4>Bulkhead</h4>
        <NumField label="Length" value={comp.length * 1000} onChange={v => update({ length: v / 1000 })} />
        <NumField label="Diameter" value={comp.outerRadius * 2000} onChange={v => update({ outerRadius: v / 2000 })} />
    </div>
);

// === Airbrakes Editor ===
const AirbrakesEditor: React.FC<{ comp: Airbrakes; update: (u: any) => void; parentRadius: number }> = ({ comp, update, parentRadius }) => {
    // Auto-compute flat-plate Cd from blade aspect ratio (Hoerner's data, wall-mounted)
    const arEff = comp.bladeWidth > 0 ? 2 * comp.bladeHeight / comp.bladeWidth : 1;
    // Piecewise-linear interpolation of Hoerner's table for flat plates
    const hoernerTable: [number, number][] = [
        [0.5, 1.12], [1.0, 1.17], [2.0, 1.19], [5.0, 1.20],
        [10.0, 1.29], [20.0, 1.49], [40.0, 1.70],
    ];
    let autoCd = 1.17;
    if (arEff <= hoernerTable[0][0]) {
        autoCd = hoernerTable[0][1];
    } else if (arEff >= hoernerTable[hoernerTable.length - 1][0]) {
        const last = hoernerTable[hoernerTable.length - 1];
        autoCd = last[1] + (1.98 - last[1]) * (1 - last[0] / arEff);
    } else {
        for (let i = 0; i < hoernerTable.length - 1; i++) {
            if (arEff >= hoernerTable[i][0] && arEff <= hoernerTable[i + 1][0]) {
                const t = (arEff - hoernerTable[i][0]) / (hoernerTable[i + 1][0] - hoernerTable[i][0]);
                autoCd = hoernerTable[i][1] + t * (hoernerTable[i + 1][1] - hoernerTable[i][1]);
                break;
            }
        }
    }

    const effectiveCd = comp.cdAutoCalculate !== false ? autoCd : comp.cd;
    const maxAngleRad = comp.maxDeployAngle * Math.PI / 180;
    const perBladeArea = comp.bladeWidth * comp.bladeHeight; // m²
    const perBladeProjected = perBladeArea * Math.sin(maxAngleRad); // projected normal to flow
    const totalProjectedArea = comp.bladeCount * perBladeProjected;
    const refArea = parentRadius > 0 ? Math.PI * parentRadius * parentRadius : 0;
    const effectiveDeltaCd = refArea > 0 ? effectiveCd * totalProjectedArea / refArea : 0;

    return (
        <div className="editor-section">
            <h4>Airbrakes Configuration</h4>
            <div className="field">
                <label>Number of Blades</label>
                <input type="number" min={1} max={8} value={comp.bladeCount} onChange={e => update({ bladeCount: parseInt(e.target.value) || 3 })} />
            </div>
            <NumField label="Blade Height (Span)" value={comp.bladeHeight * 1000} onChange={v => update({ bladeHeight: v / 1000 })} />
            <NumField label="Blade Width (Chord)" value={comp.bladeWidth * 1000} onChange={v => update({ bladeWidth: v / 1000 })} />
            <NumField label="Blade Thickness" value={comp.bladeThickness * 1000} onChange={v => update({ bladeThickness: v / 1000 })} />
            <NumField label="Max Deploy Angle" value={comp.maxDeployAngle} onChange={v => update({ maxDeployAngle: v })} step={1} min={0} max={90} unit="°" />

            <h4>Drag Coefficient</h4>
            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ flex: 1 }}>Auto-calculate Cd from geometry</label>
                <input
                    type="checkbox"
                    checked={comp.cdAutoCalculate !== false}
                    onChange={e => update({ cdAutoCalculate: e.target.checked })}
                    style={{ width: 16, height: 16 }}
                />
            </div>
            {comp.cdAutoCalculate !== false ? (
                <div style={{ fontSize: '11px', color: '#8899aa', padding: '4px 8px', lineHeight: 1.8 }}>
                    <div>📊 Effective AR = 2 × {(comp.bladeHeight * 1000).toFixed(1)} / {(comp.bladeWidth * 1000).toFixed(1)} = <strong style={{ color: '#aabbcc' }}>{arEff.toFixed(2)}</strong> (wall-mounted)</div>
                    <div>📊 Hoerner flat-plate Cd = <strong style={{ color: '#f0c040' }}>{autoCd.toFixed(4)}</strong></div>
                    <div style={{ opacity: 0.6, fontSize: '10px' }}>Based on Hoerner "Fluid Dynamic Drag" Ch.3 — rectangular flat plate normal to flow</div>
                </div>
            ) : (
                <NumField label="Manual Flat Plate Cd" value={comp.cd} onChange={v => update({ cd: v })} step={0.01} min={0} unit="" />
            )}

            <div className="airbrakes-drag-info" style={{ fontSize: '11px', color: '#8899aa', padding: '6px 8px', lineHeight: 1.8, background: 'rgba(255,255,255,0.03)', borderRadius: '4px', margin: '6px 0' }}>
                <div>📐 Per-blade area: <strong style={{ color: '#aabbcc' }}>{(perBladeArea * 1e4).toFixed(2)} cm²</strong></div>
                <div>📐 Projected area @ {comp.maxDeployAngle}°: <strong style={{ color: '#aabbcc' }}>{(perBladeProjected * 1e4).toFixed(2)} cm²</strong> / blade</div>
                <div>📐 Total projected ({comp.bladeCount} blades): <strong style={{ color: '#aabbcc' }}>{(totalProjectedArea * 1e4).toFixed(2)} cm²</strong></div>
                {refArea > 0 && (
                    <>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '4px', paddingTop: '4px' }}>
                            🎯 Body ref. area: <strong style={{ color: '#aabbcc' }}>{(refArea * 1e4).toFixed(2)} cm²</strong>
                        </div>
                        <div>🎯 Cd per blade: <strong style={{ color: '#aabbcc' }}>{effectiveCd.toFixed(4)}</strong> {comp.cdAutoCalculate !== false ? '(auto)' : '(manual)'}</div>
                        <div>🎯 <strong style={{ color: '#f0c040' }}>Effective ΔCd = {effectiveDeltaCd.toFixed(4)}</strong></div>
                        <div style={{ opacity: 0.6, fontSize: '10px' }}>= Cd_plate × N_blades × A_projected / A_ref</div>
                        <div style={{ opacity: 0.6, fontSize: '10px', color: '#7cc47c' }}>✅ This is automatically added to the rocket's total drag coefficient</div>
                    </>
                )}
            </div>

            <h4>Deployment Settings</h4>
            <div className="field">
                <label>Deploy Event</label>
                <select value={comp.deployEvent} onChange={e => update({ deployEvent: e.target.value })}>
                    <option value="altitude">At Altitude (ascending)</option>
                    <option value="burnout">After Motor Burnout</option>
                    <option value="apogee">At Apogee</option>
                    <option value="timer">Timer (from launch)</option>
                    <option value="never">Never (manual / disabled)</option>
                </select>
            </div>
            {comp.deployEvent === 'altitude' && (
                <NumField label="Deploy Altitude" value={comp.deployAltitude} onChange={v => update({ deployAltitude: v })} step={10} min={0} unit="m" />
            )}
            {(comp.deployEvent === 'burnout' || comp.deployEvent === 'apogee' || comp.deployEvent === 'timer') && (
                <NumField label="Deploy Delay" value={comp.deployDelay} onChange={v => update({ deployDelay: v })} step={0.1} min={0} unit="s" />
            )}
            <NumField label="Deploy Speed (time to open)" value={comp.deploySpeed} onChange={v => update({ deploySpeed: v })} step={0.05} min={0.05} unit="s" />
        </div>
    );
};
