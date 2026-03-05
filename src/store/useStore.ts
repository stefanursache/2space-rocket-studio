import { create } from 'zustand';
import {
    Rocket, RocketComponent, Motor, SimulationOptions, SimulationResult,
    ViewMode, ViewOrientation, StabilityData
} from '../types/rocket';
import { createDefaultRocket, createExampleRocket } from '../models/components';
import { calculateStability } from '../physics/aerodynamics';
import { runSimulation, getDefaultSimulationOptions } from '../physics/simulation';
import { MOTOR_DATABASE } from '../models/motors';
import {
    getCachedMotors, syncMotors as syncMotorsFromAPI,
    needsSync, getLastSyncDate, fetchAndCacheThrustCurve,
} from '../services/motorCache';
import { importOrkFile, matchMotor, OrkImportResult } from '../services/orkImporter';

function computeMotorPosition(rocket: Rocket, motor: Motor | null): number {
    if (!motor) return 0;
    const motorLen = motor.length / 1000; // mm → m

    // Walk through the rocket to find the motor mount and its axial position.
    // The motor mount can be a body tube or an inner tube with isMotorMount=true.
    // We return the axial position of the motor FRONT from the nose tip.
    let x = 0; // running axial position of current top-level component start
    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            const compLen = comp.type === 'nosecone' ? comp.length
                : comp.type === 'bodytube' ? comp.length
                    : comp.type === 'transition' ? comp.length
                        : 0;

            // Check if this top-level component is a motor mount (body tube)
            if (comp.type === 'bodytube' && comp.isMotorMount) {
                // Motor aft end aligns with body tube aft end + overhang
                const mountEnd = x + compLen + (comp.motorOverhang || 0);
                return mountEnd - motorLen;
            }

            // Check children for inner tubes that are motor mounts
            if (comp.type === 'bodytube' && comp.children) {
                for (const child of comp.children) {
                    if (child.type === 'innertube' && child.isMotorMount) {
                        // Inner tube position is relative to parent body tube
                        const childPos = child.position ?? 0;
                        const childEnd = x + childPos + child.length + (child.motorOverhang || 0);
                        return childEnd - motorLen;
                    }
                }
            }

            // Also check nose cone children
            if (comp.type === 'nosecone' && comp.children) {
                for (const child of comp.children) {
                    if (child.type === 'innertube' && child.isMotorMount) {
                        const childPos = child.position ?? 0;
                        const childEnd = x + childPos + child.length + (child.motorOverhang || 0);
                        return childEnd - motorLen;
                    }
                }
            }

            x += compLen;
        }
    }

    // Fallback: place motor at the tail end of the rocket
    return x - motorLen;
}

interface AppState {
    // Rocket design
    rocket: Rocket;
    selectedComponentId: string | null;
    selectedStageIndex: number;

    // Motor
    selectedMotor: Motor | null;
    motorPosition: number; // axial position of motor REAR from nose tip, in meters

    // View
    viewMode: ViewMode;
    viewOrientation: ViewOrientation;
    zoom: number;

    // Simulation
    simulationOptions: SimulationOptions;
    simulationResults: SimulationResult[];
    activeSimulationId: string | null;
    isSimulating: boolean;

    // Stability (cached)
    stability: StabilityData | null;

    // Motor database (dynamic)
    motors: Motor[];
    motorSyncStatus: 'idle' | 'syncing' | 'done' | 'error';
    motorSyncProgress: string;
    lastMotorSync: string | null; // ISO date
    motorSyncError: string | null;

    // UI state
    showMotorSelector: boolean;
    showComponentEditor: boolean;
    show3DView: boolean;

    // Actions
    initMotors: () => Promise<void>;
    syncMotorsFromAPI: () => Promise<void>;
    ensureThrustCurve: (motor: Motor) => Promise<Motor>;
    setRocket: (rocket: Rocket) => void;
    updateRocket: (updater: (rocket: Rocket) => Rocket) => void;
    selectComponent: (id: string | null) => void;
    setSelectedStageIndex: (index: number) => void;
    addComponent: (component: RocketComponent, parentId?: string) => void;
    removeComponent: (id: string) => void;
    updateComponent: (id: string, updates: Partial<RocketComponent>) => void;
    moveComponent: (componentId: string, newParentId: string | null) => void;
    setViewMode: (mode: ViewMode) => void;
    setViewOrientation: (orientation: ViewOrientation) => void;
    setZoom: (zoom: number) => void;
    setSelectedMotor: (motor: Motor | null) => void;
    setMotorPosition: (pos: number) => void;
    setSimulationOptions: (options: Partial<SimulationOptions>) => void;
    runSim: () => void;
    deleteSimulation: (id: string) => void;
    setActiveSimulation: (id: string | null) => void;
    recalculateStability: () => void;
    setShowMotorSelector: (show: boolean) => void;
    setShowComponentEditor: (show: boolean) => void;
    setShow3DView: (show: boolean) => void;
    loadExampleRocket: () => void;
    newRocket: () => void;
    addStage: () => void;
    removeStage: (index: number) => void;
    saveRocketToFile: () => void;
    loadRocketFromFile: () => void;
}

export const useStore = create<AppState>((set, get) => ({
    rocket: createExampleRocket(),
    selectedComponentId: null,
    selectedStageIndex: 0,
    selectedMotor: MOTOR_DATABASE.find(m => m.commonName === 'C6') || null,
    motorPosition: computeMotorPosition(createExampleRocket(), MOTOR_DATABASE.find(m => m.commonName === 'C6') || null),
    viewMode: 'design',
    viewOrientation: 'side',
    zoom: 1,
    simulationOptions: getDefaultSimulationOptions(),
    simulationResults: [],
    activeSimulationId: null,
    isSimulating: false,
    stability: null,
    motors: MOTOR_DATABASE,
    motorSyncStatus: 'idle',
    motorSyncProgress: '',
    lastMotorSync: null,
    motorSyncError: null,
    showMotorSelector: false,
    showComponentEditor: false,
    show3DView: false,

    /**
     * Load motors from IndexedDB cache on app start.
     * If cache is empty, keeps the hardcoded fallback.
     * Auto-triggers sync if >30 days old.
     */
    initMotors: async () => {
        try {
            const cached = await getCachedMotors();
            if (cached.length > 0) {
                set({ motors: cached });
            }
            const last = await getLastSyncDate();
            if (last) set({ lastMotorSync: last.toISOString() });

            // Auto-sync if needed
            const shouldSync = await needsSync();
            if (shouldSync) {
                get().syncMotorsFromAPI();
            }
        } catch (e) {
            console.warn('[Motors] Failed to load cache:', e);
        }
    },

    /**
     * Fetch all motors from ThrustCurve.org and update cache + store.
     */
    syncMotorsFromAPI: async () => {
        if (get().motorSyncStatus === 'syncing') return;
        set({ motorSyncStatus: 'syncing', motorSyncProgress: 'Starting…', motorSyncError: null });
        try {
            const motors = await syncMotorsFromAPI((phase, current, total) => {
                set({ motorSyncProgress: `${phase} (${current}/${total})` });
            });
            set({
                motors: motors.length > 0 ? motors : get().motors,
                motorSyncStatus: 'done',
                motorSyncProgress: `${motors.length} motors synced`,
                lastMotorSync: new Date().toISOString(),
                motorSyncError: null,
            });
        } catch (e: any) {
            console.error('[Motors] Sync failed:', e);
            set({
                motorSyncStatus: 'error',
                motorSyncError: e?.message || 'Sync failed',
                motorSyncProgress: '',
            });
        }
    },

    /**
     * Ensure a motor has its thrust curve downloaded.
     * Returns the motor with curve data (fetches from API if needed).
     */
    ensureThrustCurve: async (motor: Motor) => {
        if (motor.thrustCurve.length > 0) return motor;
        if (!motor.tcMotorId) return motor;

        try {
            const updated = await fetchAndCacheThrustCurve(motor.tcMotorId);
            if (updated && updated.thrustCurve.length > 0) {
                // Update in the motors array too
                set(state => ({
                    motors: state.motors.map(m =>
                        m.id === motor.id ? { ...m, thrustCurve: updated.thrustCurve, hasThrustCurve: true } : m
                    ),
                }));
                return updated;
            }
        } catch (e) {
            console.warn('[Motors] Failed to fetch thrust curve:', e);
        }
        return motor;
    },

    setRocket: (rocket) => {
        set({ rocket });
        get().recalculateStability();
    },

    updateRocket: (updater) => {
        const rocket = updater(get().rocket);
        set({ rocket });
        get().recalculateStability();
    },

    selectComponent: (id) => set({ selectedComponentId: id, showComponentEditor: id !== null }),

    setSelectedStageIndex: (index) => set({ selectedStageIndex: index }),

    addComponent: (component, parentId) => {
        const rocket = { ...get().rocket };
        const stageIndex = get().selectedStageIndex;
        const stage = { ...rocket.stages[stageIndex] };
        stage.components = [...stage.components];

        if (parentId) {
            // Auto-position: find parent length and set smart defaults
            let parentLength = 0;
            let parentChildren: RocketComponent[] = [];
            for (const c of stage.components) {
                if (c.id === parentId && c.type === 'bodytube') {
                    parentLength = c.length; parentChildren = c.children || []; break;
                }
                if (c.type === 'bodytube' && c.children) {
                    for (const ch of c.children) {
                        if (ch.id === parentId && ch.type === 'innertube') {
                            parentLength = ch.length; parentChildren = (ch as any).children || []; break;
                        }
                    }
                    if (parentLength > 0) break;
                }
            }
            if (parentLength > 0 && 'position' in component) {
                const a = component as any;
                switch (component.type) {
                    case 'trapezoidfinset': a.position = Math.max(0, parentLength - a.rootChord); break;
                    case 'ellipticalfinset': a.position = Math.max(0, parentLength - a.rootChord); break;
                    case 'freeformfinset': {
                        const mx = Math.max(...a.points.map((p: number[]) => p[0]));
                        a.position = Math.max(0, parentLength - mx); break;
                    }
                    case 'innertube': a.position = Math.max(0, parentLength - a.length); break;
                    case 'engineblock': a.position = Math.max(0, parentLength - a.length); break;
                    case 'centeringring': {
                        const rings = parentChildren.filter(ch => ch.type === 'centeringring');
                        a.position = rings.length === 0 ? parentLength * 0.2
                            : rings.length === 1 ? parentLength * 0.75 : parentLength * 0.5;
                        break;
                    }
                    case 'bulkhead': a.position = 0; break;
                    case 'tubecoupler': a.position = Math.max(0, (parentLength - a.length) / 2); break;
                    case 'parachute': a.position = parentLength * 0.05; break;
                    case 'streamer': a.position = parentLength * 0.05; break;
                    case 'shockcord': a.position = 0; break;
                    case 'launchlug': a.position = parentLength * 0.3; break;
                    case 'massobject': a.position = parentLength * 0.1; break;
                    case 'airbrakes': a.position = Math.max(0, parentLength * 0.7); break;
                }
            }

            // Add as child of body tube
            const addToChildren = (components: RocketComponent[]): RocketComponent[] => {
                return components.map(comp => {
                    if (comp.id === parentId && comp.type === 'bodytube') {
                        return {
                            ...comp,
                            children: [...comp.children, component],
                        };
                    }
                    if (comp.type === 'bodytube' && comp.children) {
                        return {
                            ...comp,
                            children: comp.children.map(child => {
                                if (child.id === parentId && child.type === 'innertube') {
                                    return {
                                        ...child,
                                        children: [...child.children, component],
                                    };
                                }
                                return child;
                            }),
                        };
                    }
                    return comp;
                });
            };
            stage.components = addToChildren(stage.components);
        } else {
            stage.components.push(component);
        }

        rocket.stages = [...rocket.stages];
        rocket.stages[stageIndex] = stage;
        set({ rocket, selectedComponentId: component.id, showComponentEditor: true });
        get().recalculateStability();
    },

    removeComponent: (id) => {
        const rocket = { ...get().rocket };

        for (let si = 0; si < rocket.stages.length; si++) {
            const stage = { ...rocket.stages[si] };
            // Remove from top-level
            let found = stage.components.findIndex(c => c.id === id);
            if (found >= 0) {
                stage.components = stage.components.filter(c => c.id !== id);
                rocket.stages = [...rocket.stages];
                rocket.stages[si] = stage;
                set({ rocket, selectedComponentId: null });
                get().recalculateStability();
                return;
            }

            // Remove from children
            stage.components = stage.components.map(comp => {
                if (comp.type === 'bodytube' && comp.children) {
                    const childIdx = comp.children.findIndex(c => c.id === id);
                    if (childIdx >= 0) {
                        return {
                            ...comp,
                            children: comp.children.filter(c => c.id !== id),
                        };
                    }
                    // Check inner tube children
                    return {
                        ...comp,
                        children: comp.children.map(child => {
                            if (child.type === 'innertube' && child.children) {
                                return {
                                    ...child,
                                    children: child.children.filter(c => c.id !== id),
                                };
                            }
                            return child;
                        }),
                    };
                }
                return comp;
            });
            rocket.stages = [...rocket.stages];
            rocket.stages[si] = stage;
        }

        set({ rocket, selectedComponentId: null });
        get().recalculateStability();
    },

    updateComponent: (id, updates) => {
        const rocket = JSON.parse(JSON.stringify(get().rocket)) as Rocket;

        const updateInList = (components: RocketComponent[]): boolean => {
            for (let i = 0; i < components.length; i++) {
                if (components[i].id === id) {
                    components[i] = { ...components[i], ...updates } as RocketComponent;
                    return true;
                }
                const comp = components[i];
                if (comp.type === 'bodytube' && comp.children) {
                    if (updateInList(comp.children)) return true;
                    for (const child of comp.children) {
                        if (child.type === 'innertube' && child.children) {
                            if (updateInList(child.children)) return true;
                        }
                    }
                }
            }
            return false;
        };

        for (const stage of rocket.stages) {
            if (updateInList(stage.components)) break;
        }

        set({ rocket });
        get().recalculateStability();
    },

    moveComponent: (componentId, newParentId) => {
        const rocket = JSON.parse(JSON.stringify(get().rocket)) as Rocket;

        // Helper: find and extract a component from the entire tree
        const extractComponent = (components: RocketComponent[]): RocketComponent | null => {
            for (let i = 0; i < components.length; i++) {
                if (components[i].id === componentId) {
                    const [found] = components.splice(i, 1);
                    return found;
                }
                const comp = components[i];
                if (comp.type === 'bodytube' && comp.children) {
                    const result = extractComponent(comp.children);
                    if (result) return result;
                }
                if (comp.type === 'innertube' && (comp as any).children) {
                    const result = extractComponent((comp as any).children);
                    if (result) return result;
                }
            }
            return null;
        };

        // Extract the component from wherever it currently is
        let found: RocketComponent | null = null;
        for (const stage of rocket.stages) {
            found = extractComponent(stage.components);
            if (found) break;
        }
        if (!found) return;

        if (newParentId === null) {
            // Move to top-level of current stage
            const stageIndex = get().selectedStageIndex;
            rocket.stages[stageIndex].components.push(found);
        } else {
            // Insert into the target parent's children
            const insertInto = (components: RocketComponent[]): boolean => {
                for (const comp of components) {
                    if (comp.id === newParentId) {
                        if (comp.type === 'bodytube') {
                            comp.children.push(found!);
                            return true;
                        }
                        if (comp.type === 'innertube' && (comp as any).children) {
                            (comp as any).children.push(found!);
                            return true;
                        }
                    }
                    if (comp.type === 'bodytube' && comp.children) {
                        if (insertInto(comp.children)) return true;
                    }
                }
                return false;
            };
            for (const stage of rocket.stages) {
                if (insertInto(stage.components)) break;
            }
        }

        set({ rocket });
        get().recalculateStability();
    },

    setViewMode: (mode) => set({ viewMode: mode }),
    setViewOrientation: (orientation) => set({ viewOrientation: orientation }),
    setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),

    setSelectedMotor: (motor) => {
        const pos = computeMotorPosition(get().rocket, motor);
        set({ selectedMotor: motor, motorPosition: pos });
        get().recalculateStability();
    },

    setMotorPosition: (pos) => {
        set({ motorPosition: pos });
        get().recalculateStability();
    },

    setSimulationOptions: (opts) => set({
        simulationOptions: { ...get().simulationOptions, ...opts }
    }),

    runSim: () => {
        set({ isSimulating: true });
        const { rocket, selectedMotor, simulationOptions, motorPosition } = get();

        // Run async to not block UI
        setTimeout(() => {
            try {
                const result = runSimulation(rocket, selectedMotor, simulationOptions, motorPosition);
                set(state => ({
                    simulationResults: [...state.simulationResults, result],
                    activeSimulationId: result.id,
                    isSimulating: false,
                }));
            } catch (e) {
                console.error('Simulation error:', e);
                set({ isSimulating: false });
            }
        }, 50);
    },

    deleteSimulation: (id) => set(state => ({
        simulationResults: state.simulationResults.filter(r => r.id !== id),
        activeSimulationId: state.activeSimulationId === id ? null : state.activeSimulationId,
    })),

    setActiveSimulation: (id) => set({ activeSimulationId: id }),

    recalculateStability: () => {
        try {
            const { rocket, selectedMotor, motorPosition } = get();
            const stability = calculateStability(rocket, selectedMotor, motorPosition);
            set({ stability });
        } catch (e) {
            console.error('Stability calculation error:', e);
        }
    },

    setShowMotorSelector: (show) => set({ showMotorSelector: show }),
    setShowComponentEditor: (show) => set({ showComponentEditor: show }),
    setShow3DView: (show) => set({ show3DView: show }),

    loadExampleRocket: () => {
        const rocket = createExampleRocket();
        set({
            rocket,
            selectedComponentId: null,
            simulationResults: [],
            activeSimulationId: null,
        });
        get().recalculateStability();
    },

    newRocket: () => {
        const rocket = createDefaultRocket();
        set({
            rocket,
            selectedComponentId: null,
            simulationResults: [],
            activeSimulationId: null,
        });
        get().recalculateStability();
    },

    addStage: () => {
        const rocket = { ...get().rocket };
        const newStage = {
            id: crypto.randomUUID ? crypto.randomUUID() : `stage-${Date.now()}`,
            name: `Stage ${rocket.stages.length + 1}`,
            components: [],
            separationEvent: 'burnout' as const,
            separationDelay: 0,
        };
        rocket.stages = [...rocket.stages, newStage];
        set({ rocket, selectedStageIndex: rocket.stages.length - 1 });
    },

    removeStage: (index) => {
        const rocket = { ...get().rocket };
        if (rocket.stages.length <= 1) return;
        rocket.stages = rocket.stages.filter((_, i) => i !== index);
        set({
            rocket,
            selectedStageIndex: Math.min(get().selectedStageIndex, rocket.stages.length - 1),
        });
        get().recalculateStability();
    },

    saveRocketToFile: () => {
        const { rocket, selectedMotor, motorPosition } = get();
        const data = JSON.stringify({ rocket, selectedMotor, motorPosition }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${rocket.name.replace(/[^a-zA-Z0-9]/g, '_')}.ork.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    loadRocketFromFile: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.ork.json,.ork';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const fileName = file.name.toLowerCase();

            // JSON format (our own save format)
            if (fileName.endsWith('.json')) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const data = JSON.parse(ev.target?.result as string);
                        if (data.rocket) {
                            set({
                                rocket: data.rocket,
                                selectedMotor: data.selectedMotor || null,
                                motorPosition: data.motorPosition || 0,
                                selectedComponentId: null,
                                simulationResults: [],
                                activeSimulationId: null,
                            });
                            get().recalculateStability();
                        }
                    } catch (err) {
                        alert('Invalid rocket JSON file');
                    }
                };
                reader.readAsText(file);
                return;
            }

            // .ork format (OpenRocket XML or ZIP)
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const content = ev.target?.result;
                    if (!content) throw new Error('Empty file');

                    let importResult: OrkImportResult;
                    if (content instanceof ArrayBuffer) {
                        // Check if XML or ZIP
                        const bytes = new Uint8Array(content);
                        if (bytes[0] === 0x3C) {
                            // Starts with '<' — plain XML
                            importResult = await importOrkFile(new TextDecoder('utf-8').decode(content));
                        } else {
                            importResult = await importOrkFile(content);
                        }
                    } else {
                        importResult = await importOrkFile(content as string);
                    }

                    const { rocket, motorInfo, simulationOptions, flightReference, warnings } = importResult;

                    // Try to match the motor
                    let matchedMotor: Motor | null = null;
                    if (motorInfo) {
                        const allMotors = get().motors;
                        matchedMotor = matchMotor(motorInfo, allMotors);
                    }

                    // Apply simulation options
                    const simOpts = get().simulationOptions;
                    if (simulationOptions) {
                        set({ simulationOptions: { ...simOpts, ...simulationOptions } });
                    }

                    set({
                        rocket,
                        selectedMotor: matchedMotor,
                        motorPosition: computeMotorPosition(rocket, matchedMotor),
                        selectedComponentId: null,
                        simulationResults: [],
                        activeSimulationId: null,
                    });
                    get().recalculateStability();

                    // Show import summary
                    const lines = [`✅ Imported: ${rocket.name}`];
                    if (matchedMotor) {
                        lines.push(`🔥 Motor matched: ${matchedMotor.commonName} (${matchedMotor.manufacturer})`);
                    } else if (motorInfo) {
                        lines.push(`⚠️ Motor not found in database: ${motorInfo.manufacturer} ${motorInfo.designation}`);
                        lines.push('   You can select a motor manually from the Motor Selector.');
                    }
                    if (flightReference) {
                        lines.push(`📊 OpenRocket reference: ${flightReference.maxAltitude.toFixed(0)}m alt, Mach ${flightReference.maxMach.toFixed(2)}, ${flightReference.flightTime.toFixed(0)}s flight`);
                    }
                    if (warnings.length > 0) {
                        lines.push('', ...warnings.map(w => '  ' + w));
                    }
                    alert(lines.join('\n'));

                } catch (err) {
                    console.error('[ork import]', err);
                    alert('Failed to import .ork file:\n' + (err instanceof Error ? err.message : String(err)));
                }
            };
            reader.readAsArrayBuffer(file);
        };
        input.click();
    },
}));
