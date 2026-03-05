import { v4 as uuid } from 'uuid';
import {
    NoseCone, BodyTube, Transition, TrapezoidFinSet, EllipticalFinSet,
    FreeformFinSet, InnerTube, EngineBlock, CenteringRing, Bulkhead,
    LaunchLug, Parachute, Streamer, ShockCord, MassObject,
    TubeCoupler, Airbrakes, RocketComponent, Stage, Rocket
} from '../types/rocket';
import { getDefaultBulkMaterial, getDefaultSurfaceMaterial, getDefaultLineMaterial } from './materials';

export function createNoseCone(): NoseCone {
    return {
        id: uuid(), type: 'nosecone', name: 'Nose cone',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultBulkMaterial(),
        finish: 'regular_paint', color: '#d44', comment: '',
        shape: 'ogive', shapeParameter: 1.0,
        length: 0.10, baseRadius: 0.0125,
        thickness: 0.002,
        shoulderLength: 0.02, shoulderRadius: 0.011,
        shoulderThickness: 0.002,
    };
}

export function createBodyTube(): BodyTube {
    return {
        id: uuid(), type: 'bodytube', name: 'Body tube',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultBulkMaterial(),
        finish: 'regular_paint', color: '#a8b8c8', comment: '',
        length: 0.30, outerRadius: 0.0125, innerRadius: 0.0122,
        isMotorMount: false, motorOverhang: 0.005,
        children: [],
    };
}

export function createTransition(): Transition {
    return {
        id: uuid(), type: 'transition', name: 'Transition',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultBulkMaterial(),
        finish: 'regular_paint', color: '#a8b8c8', comment: '',
        shape: 'conical', shapeParameter: 1.0,
        length: 0.05, foreRadius: 0.0125, aftRadius: 0.019,
        thickness: 0.002,
        shoulderLength: 0.0, shoulderRadius: 0.0,
    };
}

export function createTrapezoidFinSet(): TrapezoidFinSet {
    return {
        id: uuid(), type: 'trapezoidfinset', name: 'Trapezoidal fin set',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: { name: 'Plywood (birch)', density: 630, type: 'bulk' },
        finish: 'regular_paint', color: '#c8843c', comment: '',
        finCount: 3, rootChord: 0.05, tipChord: 0.03,
        height: 0.04, sweepLength: 0.015, sweepAngle: 0,
        thickness: 0.003, crossSection: 'rounded',
        cantAngle: 0, tabLength: 0.025, tabHeight: 0.003,
        position: 0,
    };
}

export function createEllipticalFinSet(): EllipticalFinSet {
    return {
        id: uuid(), type: 'ellipticalfinset', name: 'Elliptical fin set',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: { name: 'Plywood (birch)', density: 630, type: 'bulk' },
        finish: 'regular_paint', color: '#c8843c', comment: '',
        finCount: 3, rootChord: 0.05, height: 0.04,
        thickness: 0.003, crossSection: 'rounded',
        cantAngle: 0, tabLength: 0.025, tabHeight: 0.003,
        position: 0,
    };
}

export function createFreeformFinSet(): FreeformFinSet {
    return {
        id: uuid(), type: 'freeformfinset', name: 'Freeform fin set',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: { name: 'Plywood (birch)', density: 630, type: 'bulk' },
        finish: 'regular_paint', color: '#c8843c', comment: '',
        finCount: 3,
        points: [[0, 0], [0.015, 0.04], [0.05, 0.04], [0.05, 0]],
        thickness: 0.003, crossSection: 'rounded',
        cantAngle: 0, position: 0,
    };
}

export function createInnerTube(): InnerTube {
    return {
        id: uuid(), type: 'innertube', name: 'Inner tube',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultBulkMaterial(),
        finish: 'unfinished', color: '#cccccc', comment: '',
        length: 0.075, outerRadius: 0.009, innerRadius: 0.0085,
        isMotorMount: true, motorOverhang: 0.005,
        position: 0, children: [],
    };
}

export function createEngineBlock(): EngineBlock {
    return {
        id: uuid(), type: 'engineblock', name: 'Engine block',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultBulkMaterial(),
        finish: 'unfinished', color: '#888888', comment: '',
        length: 0.005, outerRadius: 0.009, innerRadius: 0.005,
        position: 0,
    };
}

export function createCenteringRing(): CenteringRing {
    return {
        id: uuid(), type: 'centeringring', name: 'Centering ring',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: { name: 'Plywood (birch)', density: 630, type: 'bulk' },
        finish: 'unfinished', color: '#ddbb88', comment: '',
        length: 0.003, outerRadius: 0.0122, innerRadius: 0.009,
        position: 0,
    };
}

export function createBulkhead(): Bulkhead {
    return {
        id: uuid(), type: 'bulkhead', name: 'Bulkhead',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: { name: 'Plywood (birch)', density: 630, type: 'bulk' },
        finish: 'unfinished', color: '#ddbb88', comment: '',
        length: 0.003, outerRadius: 0.0122,
        position: 0,
    };
}

export function createTubeCoupler(): TubeCoupler {
    return {
        id: uuid(), type: 'tubecoupler', name: 'Tube coupler',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultBulkMaterial(),
        finish: 'unfinished', color: '#cccccc', comment: '',
        length: 0.05, outerRadius: 0.0122, innerRadius: 0.0119,
        position: 0,
    };
}

export function createLaunchLug(): LaunchLug {
    return {
        id: uuid(), type: 'launchlug', name: 'Launch lug',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultBulkMaterial(),
        finish: 'unfinished', color: '#cccccc', comment: '',
        length: 0.03, outerRadius: 0.003, innerRadius: 0.002,
        position: 0, radialAngle: 0,
    };
}

export function createParachute(): Parachute {
    return {
        id: uuid(), type: 'parachute', name: 'Parachute',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultSurfaceMaterial(),
        finish: 'unfinished', color: '#ff4444', comment: '',
        diameter: 0.3, cd: 0.8,
        lineCount: 6, lineLength: 0.3,
        deployEvent: 'apogee', deployAltitude: 200, deployDelay: 1,
        position: 0,
    };
}

export function createStreamer(): Streamer {
    return {
        id: uuid(), type: 'streamer', name: 'Streamer',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultSurfaceMaterial(),
        finish: 'unfinished', color: '#ff8800', comment: '',
        stripLength: 0.5, stripWidth: 0.05, cd: 0.6,
        deployEvent: 'apogee', deployAltitude: 200, deployDelay: 1,
        position: 0,
    };
}

export function createShockCord(): ShockCord {
    return {
        id: uuid(), type: 'shockcord', name: 'Shock cord',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultLineMaterial(),
        finish: 'unfinished', color: '#333333', comment: '',
        cordLength: 0.3, position: 0,
    };
}

export function createMassObject(): MassObject {
    return {
        id: uuid(), type: 'massobject', name: 'Mass component',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: getDefaultBulkMaterial(),
        finish: 'unfinished', color: '#666666', comment: '',
        componentMass: 0.01, length: 0.02, radius: 0.01,
        position: 0,
    };
}

export function createAirbrakes(): Airbrakes {
    return {
        id: uuid(), type: 'airbrakes', name: 'Airbrakes',
        massOverridden: false, cgOverridden: false, cdOverridden: false,
        material: { name: 'Aluminum 6061', density: 2700, type: 'bulk' },
        finish: 'smooth_paint', color: '#e07020', comment: '',
        bladeCount: 3,
        bladeHeight: 0.015,     // 15mm span
        bladeWidth: 0.020,      // 20mm chord
        bladeThickness: 0.001,  // 1mm thick
        maxDeployAngle: 60,     // degrees
        cd: 1.17,               // manual override flat plate Cd
        cdAutoCalculate: true,  // auto-compute from geometry by default
        deployEvent: 'altitude',
        deployAltitude: 300,    // m AGL
        deployDelay: 0,         // s
        deploySpeed: 0.3,       // 0.3s to fully open
        position: 0,
    };
}

export function createStage(name: string = 'Sustainer'): Stage {
    return {
        id: uuid(), name,
        components: [],
        separationEvent: 'none',
        separationDelay: 0,
    };
}

export function createDefaultRocket(): Rocket {
    const stage = createStage('Sustainer');
    const nose = createNoseCone();
    const body = createBodyTube();
    const fins = createTrapezoidFinSet();
    const innerTube = createInnerTube();
    const chute = createParachute();
    const lug = createLaunchLug();

    // Smart auto-position children inside body tube
    fins.position = Math.max(0, body.length - fins.rootChord);
    innerTube.position = Math.max(0, body.length - innerTube.length);
    chute.position = body.length * 0.05;
    lug.position = body.length * 0.3;

    body.children = [fins, innerTube, chute, lug];

    stage.components = [nose, body];

    return {
        id: uuid(),
        name: 'New Rocket',
        designer: '',
        comment: '',
        stages: [stage],
    };
}

export function createExampleRocket(): Rocket {
    const stage = createStage('Sustainer');

    const nose: NoseCone = {
        ...createNoseCone(),
        name: 'Nose cone',
        shape: 'ogive',
        length: 0.07,
        baseRadius: 0.012,
        thickness: 0.002,
        shoulderLength: 0.02,
        shoulderRadius: 0.011,
        color: '#d44',
    };

    const body: BodyTube = {
        ...createBodyTube(),
        name: 'Body tube',
        length: 0.20,
        outerRadius: 0.012,
        innerRadius: 0.0117,
        color: '#a8b8c8',
        children: [],
    };

    const fins: TrapezoidFinSet = {
        ...createTrapezoidFinSet(),
        finCount: 3,
        rootChord: 0.05,
        tipChord: 0.03,
        height: 0.04,
        sweepLength: 0.015,
        thickness: 0.002,
        crossSection: 'rounded',
        color: '#c8843c',
    };

    const innerTube: InnerTube = {
        ...createInnerTube(),
        length: 0.075,
        outerRadius: 0.009,
        innerRadius: 0.0085,
        isMotorMount: true,
        motorOverhang: 0.003,
        children: [],
    };

    const engineBlock = createEngineBlock();
    const ring1 = createCenteringRing();
    const ring2 = { ...createCenteringRing(), name: 'Centering ring 2' };
    const chute: Parachute = {
        ...createParachute(),
        diameter: 0.25,
        lineCount: 6,
        lineLength: 0.25,
    };
    const shock = createShockCord();
    const lug: LaunchLug = {
        ...createLaunchLug(),
        length: 0.025,
    };

    // Smart auto-position children
    engineBlock.position = Math.max(0, innerTube.length - engineBlock.length);
    innerTube.children = [engineBlock];

    fins.position = Math.max(0, body.length - fins.rootChord);
    innerTube.position = Math.max(0, body.length - innerTube.length);
    ring1.position = body.length * 0.2;
    ring2.position = body.length * 0.75;
    chute.position = body.length * 0.05;
    shock.position = 0;
    lug.position = body.length * 0.3;

    body.children = [fins, innerTube, ring1, ring2, chute, shock, lug];
    stage.components = [nose, body];

    return {
        id: uuid(),
        name: 'Estes Alpha III',
        designer: 'Estes Industries',
        comment: 'A classic beginner model rocket',
        stages: [stage],
    };
}

export function getComponentLength(comp: RocketComponent): number {
    switch (comp.type) {
        case 'nosecone': return comp.length;
        case 'bodytube': return comp.length;
        case 'transition': return comp.length;
        default: return 0;
    }
}

export function getComponentRadius(comp: RocketComponent): number {
    switch (comp.type) {
        case 'nosecone': return comp.baseRadius;
        case 'bodytube': return comp.outerRadius;
        case 'transition': return Math.max(comp.foreRadius, comp.aftRadius);
        default: return 0;
    }
}

export function isBodyComponent(comp: RocketComponent): boolean {
    return comp.type === 'nosecone' || comp.type === 'bodytube' || comp.type === 'transition';
}

export function isInternalComponent(comp: RocketComponent): boolean {
    return ['innertube', 'engineblock', 'centeringring', 'bulkhead', 'tubecoupler',
        'parachute', 'streamer', 'shockcord', 'massobject'].includes(comp.type);
}

export function isExternalComponent(comp: RocketComponent): boolean {
    return ['trapezoidfinset', 'ellipticalfinset', 'freeformfinset', 'launchlug', 'airbrakes'].includes(comp.type);
}
