import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { RocketComponent } from '../types/rocket';

/** Numeric input with local editing state */
const TreeNumInput: React.FC<{ value: number; onChange: (v: number) => void; step?: number }> = ({ value, onChange, step }) => {
    const [local, setLocal] = useState(String(value));
    const [editing, setEditing] = useState(false);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { if (!editing) setLocal(String(value)); }, [value, editing]);
    const commit = () => { setEditing(false); const p = parseFloat(local); if (!isNaN(p)) onChange(p); else setLocal(String(value)); };
    return <input ref={ref} type="number" step={step} value={local}
        onFocus={() => { setEditing(true); setTimeout(() => ref.current?.select(), 0); }}
        onChange={e => setLocal(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { commit(); ref.current?.blur(); } if (e.key === 'Escape') { setEditing(false); setLocal(String(value)); ref.current?.blur(); } }}
    />;
};

const COMP_ICONS: Record<string, string> = {
    nosecone: '▲',
    bodytube: '▬',
    transition: '⊿',
    trapezoidfinset: '◣',
    ellipticalfinset: '◗',
    freeformfinset: '✎',
    innertube: '◯',
    engineblock: '⊡',
    centeringring: '⊚',
    bulkhead: '⊖',
    tubecoupler: '⊟',
    launchlug: '⊢',
    parachute: '☂',
    streamer: '⚑',
    shockcord: '〰',
    massobject: '⊕',
};

function formatType(type: string): string {
    const map: Record<string, string> = {
        nosecone: 'Nose Cone',
        bodytube: 'Body Tube',
        transition: 'Transition',
        trapezoidfinset: 'Trap. Fins',
        ellipticalfinset: 'Ellip. Fins',
        freeformfinset: 'Freeform Fins',
        innertube: 'Inner Tube',
        engineblock: 'Eng. Block',
        centeringring: 'Cent. Ring',
        bulkhead: 'Bulkhead',
        tubecoupler: 'Tube Coupler',
        launchlug: 'Launch Lug',
        parachute: 'Parachute',
        streamer: 'Streamer',
        shockcord: 'Shock Cord',
        massobject: 'Mass',
    };
    return map[type] || type;
}

/** Can this component type hold children? */
function isContainer(type: string): boolean {
    return type === 'bodytube' || type === 'innertube';
}

/** Top-level body types that form the rocket structure (not re-parentable) */
function isTopLevel(type: string): boolean {
    return type === 'nosecone' || type === 'bodytube' || type === 'transition';
}

/* ---------------------------------------------------------------
   ComponentNode — a single draggable / droppable tree row
   --------------------------------------------------------------- */
const ComponentNode: React.FC<{
    component: RocketComponent;
    depth: number;
    dragId: string | null;
    dropTargetId: string | null;
    onDragStart: (id: string) => void;
    onDragEnd: () => void;
    onDropTarget: (id: string | null) => void;
    onDrop: (componentId: string, newParentId: string | null) => void;
}> = ({ component, depth, dragId, dropTargetId, onDragStart, onDragEnd, onDropTarget, onDrop }) => {
    const { selectedComponentId, selectComponent } = useStore();
    const isSelected = selectedComponentId === component.id;
    const isDragging = dragId === component.id;
    const isDropHere = dropTargetId === component.id;

    const children: RocketComponent[] = [];
    if (component.type === 'bodytube' && component.children) {
        children.push(...component.children);
    }
    if (component.type === 'nosecone' && (component as any).children) {
        children.push(...(component as any).children);
    }
    if (component.type === 'innertube' && (component as any).children) {
        children.push(...(component as any).children);
    }

    /* --- drag handlers --- */
    const handleDragStart = (e: React.DragEvent) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', component.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(component.id);
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!isContainer(component.type)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        onDropTarget(component.id);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.stopPropagation();
        if (dropTargetId === component.id) onDropTarget(null);
    };

    const handleDropEvt = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const droppedId = e.dataTransfer.getData('text/plain');
        if (droppedId && droppedId !== component.id && isContainer(component.type)) {
            onDrop(droppedId, component.id);
        }
        onDropTarget(null);
    };

    const isContainerComp = isContainer(component.type);

    return (
        <div
            className={`tree-node${isContainerComp ? ' tree-container' : ''}${isContainerComp && isDropHere ? ' container-drop-active' : ''}`}
            onDragOver={isContainerComp ? (e: React.DragEvent) => {
                e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDropTarget(component.id);
            } : undefined}
            onDrop={isContainerComp ? (e: React.DragEvent) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id && id !== component.id) onDrop(id, component.id);
                onDropTarget(null);
            } : undefined}
        >
            <div
                className={
                    'tree-item'
                    + (isSelected ? ' selected' : '')
                    + (isDragging ? ' dragging' : '')
                    + (isDropHere ? ' drop-target' : '')
                }
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                onClick={() => selectComponent(component.id)}
                draggable={!isTopLevel(component.type)}
                onDragStart={handleDragStart}
                onDragEnd={onDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDropEvt}
            >
                {!isTopLevel(component.type) && (
                    <span className="drag-handle" title="Drag to reparent">⠿</span>
                )}
                <span className="tree-icon" style={{ color: component.color }}>
                    {COMP_ICONS[component.type] || '•'}
                </span>
                <div className="tree-item-content">
                    <span className="tree-name">{component.name}</span>
                    <div className="tree-meta">
                        <span className="tree-type">{formatType(component.type)}</span>
                        {'position' in component && !isTopLevel(component.type) && (
                            <span className="tree-pos" title="Position from parent front">
                                {((component as any).position * 1000).toFixed(0)}mm
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Render children */}
            {children.map(child => (
                <ComponentNode
                    key={child.id}
                    component={child}
                    depth={depth + 1}
                    dragId={dragId}
                    dropTargetId={dropTargetId}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDropTarget={onDropTarget}
                    onDrop={onDrop}
                />
            ))}

            {/* Empty container hint when dragging over it */}
            {isContainer(component.type) && children.length === 0 && isDropHere && (
                <div className="tree-drop-hint" style={{ paddingLeft: `${28 + depth * 16}px` }}>
                    Drop here
                </div>
            )}
        </div>
    );
};

/* ---------------------------------------------------------------
   ComponentTree — main tree with drag-drop + motor button
   --------------------------------------------------------------- */
export const ComponentTree: React.FC = () => {
    const {
        rocket, selectedStageIndex, setSelectedStageIndex,
        addStage, removeStage, removeComponent, selectedComponentId,
        moveComponent, selectedMotor, setShowMotorSelector,
        motorPosition, setMotorPosition,
    } = useStore();

    const [dragId, setDragId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);

    const handleDragStart = useCallback((id: string) => setDragId(id), []);
    const handleDragEnd = useCallback(() => {
        setDragId(null);
        setDropTargetId(null);
    }, []);
    const handleDropTarget = useCallback((id: string | null) => setDropTargetId(id), []);

    const handleDrop = useCallback((componentId: string, newParentId: string | null) => {
        moveComponent(componentId, newParentId);
        setDragId(null);
        setDropTargetId(null);
    }, [moveComponent]);

    return (
        <div className="component-tree">
            <div className="tree-header">
                <h3>🚀 {rocket.name}</h3>
                {rocket.designer && <span className="designer">by {rocket.designer}</span>}
            </div>

            <div className="stage-tabs">
                {rocket.stages.map((stage, idx) => (
                    <div
                        key={stage.id}
                        className={`stage-tab ${idx === selectedStageIndex ? 'active' : ''}`}
                        onClick={() => setSelectedStageIndex(idx)}
                    >
                        <span>{stage.name}</span>
                        {rocket.stages.length > 1 && (
                            <button
                                className="stage-remove"
                                onClick={(e) => { e.stopPropagation(); removeStage(idx); }}
                                title="Remove stage"
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
                <button className="add-stage-btn" onClick={addStage} title="Add stage">+</button>
            </div>

            <div className="tree-body">
                {rocket.stages[selectedStageIndex]?.components.map(comp => (
                    <ComponentNode
                        key={comp.id}
                        component={comp}
                        depth={0}
                        dragId={dragId}
                        dropTargetId={dropTargetId}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDropTarget={handleDropTarget}
                        onDrop={handleDrop}
                    />
                ))}
                {rocket.stages[selectedStageIndex]?.components.length === 0 && (
                    <div className="tree-empty">
                        <p>No components yet.</p>
                        <p>Add components from the toolbar above.</p>
                    </div>
                )}
            </div>

            {/* Motor section */}
            <div className="tree-motor-section">
                <div className="tree-motor-row">
                    <span className="tree-motor-label">Motor</span>
                    {selectedMotor ? (
                        <span className="tree-motor-name">{selectedMotor.designation}</span>
                    ) : (
                        <span className="tree-motor-none">None</span>
                    )}
                    <button
                        className="motor-mount-btn"
                        onClick={() => setShowMotorSelector(true)}
                        title={selectedMotor ? 'Change motor' : 'Select a motor for this rocket'}
                    >
                        {selectedMotor ? 'Change' : '+ Add Motor'}
                    </button>
                </div>
                {selectedMotor && (
                    <div className="tree-motor-stats">
                        {selectedMotor.manufacturer} · {selectedMotor.totalImpulse.toFixed(0)} Ns · {selectedMotor.burnTime.toFixed(1)}s
                    </div>
                )}
                {selectedMotor && (
                    <div className="tree-motor-position">
                        <label>Position (mm from nose)</label>
                        <TreeNumInput
                            value={Math.round(motorPosition * 1000)}
                            onChange={v => setMotorPosition(v / 1000)}
                            step={1}
                        />
                    </div>
                )}
            </div>

            {selectedComponentId && (
                <div className="tree-actions">
                    <button
                        className="delete-btn"
                        onClick={() => removeComponent(selectedComponentId)}
                    >
                        Delete Selected
                    </button>
                </div>
            )}
        </div>
    );
};
