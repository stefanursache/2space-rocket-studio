import React from 'react';
import { useStore } from '../store/useStore';
import {
    createNoseCone, createBodyTube, createTransition,
    createTrapezoidFinSet, createEllipticalFinSet, createFreeformFinSet,
    createInnerTube, createEngineBlock, createCenteringRing, createBulkhead,
    createTubeCoupler, createLaunchLug, createParachute, createStreamer,
    createShockCord, createMassObject, createAirbrakes
} from '../models/components';
import { RocketComponent } from '../types/rocket';

interface ComponentButton {
    label: string;
    icon: string;
    category: string;
    factory: () => RocketComponent;
    requiresParent: boolean;
    tooltip: string;
}

const COMPONENT_BUTTONS: ComponentButton[] = [
    // Body components
    { label: 'Nose Cone', icon: '▲', category: 'body', factory: createNoseCone, requiresParent: false, tooltip: 'Add a nose cone' },
    { label: 'Body Tube', icon: '▬', category: 'body', factory: createBodyTube, requiresParent: false, tooltip: 'Add a body tube' },
    { label: 'Transition', icon: '⊿', category: 'body', factory: createTransition, requiresParent: false, tooltip: 'Add a transition' },

    // Fin components
    { label: 'Trapezoidal', icon: '◣', category: 'fins', factory: createTrapezoidFinSet, requiresParent: true, tooltip: 'Add trapezoidal fins' },
    { label: 'Elliptical', icon: '◗', category: 'fins', factory: createEllipticalFinSet, requiresParent: true, tooltip: 'Add elliptical fins' },
    { label: 'Freeform', icon: '✎', category: 'fins', factory: createFreeformFinSet, requiresParent: true, tooltip: 'Add freeform fins' },

    // Internal components
    { label: 'Inner Tube', icon: '◯', category: 'internal', factory: createInnerTube, requiresParent: true, tooltip: 'Add an inner tube (motor mount)' },
    { label: 'Engine Block', icon: '⊡', category: 'internal', factory: createEngineBlock, requiresParent: true, tooltip: 'Add an engine block' },
    { label: 'Centering Ring', icon: '⊚', category: 'internal', factory: createCenteringRing, requiresParent: true, tooltip: 'Add a centering ring' },
    { label: 'Bulkhead', icon: '⊖', category: 'internal', factory: createBulkhead, requiresParent: true, tooltip: 'Add a bulkhead' },
    { label: 'Tube Coupler', icon: '⊟', category: 'internal', factory: createTubeCoupler, requiresParent: true, tooltip: 'Add a tube coupler' },

    // External components
    { label: 'Launch Lug', icon: '⊢', category: 'external', factory: createLaunchLug, requiresParent: true, tooltip: 'Add a launch lug' },
    { label: 'Airbrakes', icon: '⌇', category: 'external', factory: createAirbrakes, requiresParent: true, tooltip: 'Add deployable airbrakes' },

    // Recovery
    { label: 'Parachute', icon: '☂', category: 'recovery', factory: createParachute, requiresParent: true, tooltip: 'Add a parachute' },
    { label: 'Streamer', icon: '⚑', category: 'recovery', factory: createStreamer, requiresParent: true, tooltip: 'Add a streamer' },
    { label: 'Shock Cord', icon: '〰', category: 'recovery', factory: createShockCord, requiresParent: true, tooltip: 'Add a shock cord' },

    // Mass
    { label: 'Mass', icon: '⊕', category: 'mass', factory: createMassObject, requiresParent: true, tooltip: 'Add a mass component' },
];

export const ComponentToolbar: React.FC = () => {
    const { addComponent, selectedComponentId, rocket, selectedStageIndex } = useStore();

    const handleAdd = (btn: ComponentButton) => {
        const component = btn.factory();

        if (btn.requiresParent) {
            // Find a parent body tube
            let parentId: string | null = null;

            // Check if selected component is a body tube
            const stage = rocket.stages[selectedStageIndex];
            if (selectedComponentId) {
                for (const comp of stage.components) {
                    if (comp.id === selectedComponentId && comp.type === 'bodytube') {
                        parentId = comp.id;
                        break;
                    }
                    if (comp.type === 'bodytube') {
                        if (comp.children?.some(c => c.id === selectedComponentId)) {
                            parentId = comp.id;
                            break;
                        }
                    }
                }
            }

            // If no parent found, use first body tube
            if (!parentId) {
                for (const comp of stage.components) {
                    if (comp.type === 'bodytube') {
                        parentId = comp.id;
                        break;
                    }
                }
            }

            if (parentId) {
                addComponent(component, parentId);
            } else {
                alert('Please add a Body Tube first to attach this component to.');
            }
        } else {
            addComponent(component);
        }
    };

    const categories = [
        { key: 'body', label: 'Body Components' },
        { key: 'fins', label: 'Fin Sets' },
        { key: 'internal', label: 'Internal Components' },
        { key: 'external', label: 'External' },
        { key: 'recovery', label: 'Recovery' },
        { key: 'mass', label: 'Mass' },
    ];

    return (
        <div className="component-toolbar">
            {categories.map(cat => (
                <div key={cat.key} className="component-category">
                    <span className="category-label">{cat.label}:</span>
                    <div className="category-buttons">
                        {COMPONENT_BUTTONS.filter(b => b.category === cat.key).map(btn => (
                            <button
                                key={btn.label}
                                className="component-btn"
                                onClick={() => handleAdd(btn)}
                                title={btn.tooltip}
                            >
                                <span className="comp-icon">{btn.icon}</span>
                                <span className="comp-label">{btn.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};
