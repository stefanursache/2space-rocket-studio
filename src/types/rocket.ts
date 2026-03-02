// ===========================
// Core Type Definitions
// ===========================

export type NoseConeShape = 'conical' | 'ogive' | 'ellipsoid' | 'power' | 'parabolic' | 'haack';
export type FinCrossSection = 'square' | 'rounded' | 'airfoil' | 'wedge';
export type FinShape = 'trapezoidal' | 'elliptical' | 'freeform' | 'tube';
export type Material = {
    name: string;
    density: number; // kg/m³
    type: 'bulk' | 'surface' | 'line';
};
export type SurfaceFinish = 'unfinished' | 'rough' | 'unfinished_paint' | 'regular_paint' | 'smooth_paint' | 'polished';

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

// ===========================
// Component Types
// ===========================

export type PositionReference = 'front' | 'back';

export interface BaseComponent {
    id: string;
    type: string;
    name: string;
    mass?: number; // override mass in kg
    massOverridden: boolean;
    cgOverridden: boolean;
    cgOverride?: number; // override CG position from component front
    cdOverridden: boolean;
    cdOverride?: number;
    material: Material;
    finish: SurfaceFinish;
    color: string;
    comment: string;
    positionReference?: PositionReference; // 'front' = from parent front, 'back' = from parent aft
}

export interface NoseCone extends BaseComponent {
    type: 'nosecone';
    shape: NoseConeShape;
    shapeParameter: number;
    length: number; // m
    baseRadius: number; // m (aft radius)
    thickness: number; // m
    shoulderLength: number;
    shoulderRadius: number;
    shoulderThickness: number;
}

export interface BodyTube extends BaseComponent {
    type: 'bodytube';
    length: number;
    outerRadius: number;
    innerRadius: number;
    isMotorMount: boolean;
    motorOverhang: number;
    children: RocketComponent[];
}

export interface Transition extends BaseComponent {
    type: 'transition';
    shape: NoseConeShape;
    shapeParameter: number;
    length: number;
    foreRadius: number;
    aftRadius: number;
    thickness: number;
    shoulderLength: number;
    shoulderRadius: number;
}

export interface TrapezoidFinSet extends BaseComponent {
    type: 'trapezoidfinset';
    finCount: number;
    rootChord: number;
    tipChord: number;
    height: number; // span / semi-span
    sweepLength: number;
    sweepAngle: number;
    thickness: number;
    crossSection: FinCrossSection;
    cantAngle: number;
    tabLength: number;
    tabHeight: number;
    position: number; // position along parent
}

export interface EllipticalFinSet extends BaseComponent {
    type: 'ellipticalfinset';
    finCount: number;
    rootChord: number;
    height: number;
    thickness: number;
    crossSection: FinCrossSection;
    cantAngle: number;
    tabLength: number;
    tabHeight: number;
    position: number;
}

export interface FreeformFinSet extends BaseComponent {
    type: 'freeformfinset';
    finCount: number;
    points: [number, number][];
    thickness: number;
    crossSection: FinCrossSection;
    cantAngle: number;
    position: number;
}

export interface InnerTube extends BaseComponent {
    type: 'innertube';
    length: number;
    outerRadius: number;
    innerRadius: number;
    isMotorMount: boolean;
    motorOverhang: number;
    position: number;
    children: RocketComponent[];
}

export interface TubeCoupler extends BaseComponent {
    type: 'tubecoupler';
    length: number;
    outerRadius: number;
    innerRadius: number;
    position: number;
}

export interface EngineBlock extends BaseComponent {
    type: 'engineblock';
    length: number;
    outerRadius: number;
    innerRadius: number;
    position: number;
}

export interface CenteringRing extends BaseComponent {
    type: 'centeringring';
    length: number;
    outerRadius: number;
    innerRadius: number;
    position: number;
}

export interface Bulkhead extends BaseComponent {
    type: 'bulkhead';
    length: number;
    outerRadius: number;
    position: number;
}

export interface LaunchLug extends BaseComponent {
    type: 'launchlug';
    length: number;
    outerRadius: number;
    innerRadius: number;
    position: number;
    radialAngle: number;
}

export interface Parachute extends BaseComponent {
    type: 'parachute';
    diameter: number;
    cd: number;
    lineCount: number;
    lineLength: number;
    deployEvent: 'apogee' | 'altitude' | 'timer';
    deployAltitude: number;
    deployDelay: number;
    position: number;
}

export interface Streamer extends BaseComponent {
    type: 'streamer';
    stripLength: number;
    stripWidth: number;
    cd: number;
    deployEvent: 'apogee' | 'altitude' | 'timer';
    deployAltitude: number;
    deployDelay: number;
    position: number;
}

export interface ShockCord extends BaseComponent {
    type: 'shockcord';
    cordLength: number;
    position: number;
}

export interface MassObject extends BaseComponent {
    type: 'massobject';
    componentMass: number;
    length: number;
    radius: number;
    position: number;
}

export type RocketComponent =
    | NoseCone
    | BodyTube
    | Transition
    | TrapezoidFinSet
    | EllipticalFinSet
    | FreeformFinSet
    | InnerTube
    | TubeCoupler
    | EngineBlock
    | CenteringRing
    | Bulkhead
    | LaunchLug
    | Parachute
    | Streamer
    | ShockCord
    | MassObject;

// ===========================
// Stage & Rocket
// ===========================

export interface Stage {
    id: string;
    name: string;
    components: RocketComponent[];
    separationEvent: 'none' | 'burnout' | 'ejection' | 'timer';
    separationDelay: number;
}

export interface Rocket {
    id: string;
    name: string;
    designer: string;
    comment: string;
    stages: Stage[];
}

// ===========================
// Motor
// ===========================

export interface Motor {
    id: string;
    manufacturer: string;
    designation: string;
    commonName: string;
    diameter: number; // mm
    length: number; // mm
    delays: string;
    propellantMass: number; // kg
    totalMass: number; // kg
    averageThrust: number; // N
    maxThrust: number; // N
    burnTime: number; // s
    totalImpulse: number; // Ns
    thrustCurve: [number, number][]; // [time, thrust] pairs
    impulseClass: string; // A, B, C, etc.
    tcMotorId?: string; // ThrustCurve.org motor ID (present for API-sourced motors)
    hasThrustCurve?: boolean; // whether thrust curve data has been downloaded
}

export interface MotorConfig {
    motorId: string | null;
    ignitionEvent: 'automatic' | 'launch' | 'burnout' | 'timer';
    ignitionDelay: number;
}

// ===========================
// Simulation
// ===========================

export interface SimulationOptions {
    motorConfigId: string;
    launchRodLength: number; // m
    launchRodAngle: number; // degrees from vertical
    launchRodDirection: number; // degrees, 0=north
    windSpeedAvg: number; // m/s
    windSpeedStdDev: number;
    windDirection: number; // degrees, 0=north (direction wind blows FROM)
    launchAltitude: number; // m ASL
    launchLatitude: number;
    launchLongitude: number;
    launchTemperature: number; // K
    launchPressure: number; // Pa
    timeStep: number; // s
    maxTime: number; // s
}

export interface SimulationDataPoint {
    time: number;
    altitude: number;
    velocity: number;
    acceleration: number;
    machNumber: number;
    thrustForce: number;
    dragForce: number;
    gravityForce: number;
    totalMass: number;
    angleOfAttack: number;
    lateralDistance: number;
    positionX: number;
    positionY: number;
    positionZ: number;
    velocityX: number;
    velocityY: number;
    velocityZ: number;
    cd: number;
    dynamicPressure: number;
    reynoldsNumber: number;
}

export interface SimulationResult {
    id: string;
    name: string;
    data: SimulationDataPoint[];
    maxAltitude: number;
    maxVelocity: number;
    maxAcceleration: number;
    maxMach: number;
    timeToApogee: number;
    flightTime: number;
    groundHitVelocity: number;
    launchRodVelocity: number;
    deploymentVelocity: number;
    optimalDelay: number;
    events: SimulationEvent[];
}

export interface SimulationEvent {
    time: number;
    altitude: number;
    type: 'launch' | 'launchrod' | 'burnout' | 'apogee' | 'deployment' | 'groundhit' | 'separation';
    description: string;
}

// ===========================
// Stability
// ===========================

export interface StabilityData {
    cg: number; // center of gravity from nose tip, m
    cp: number; // center of pressure from nose tip, m
    stabilityMargin: number; // in calibers
    referenceArea: number; // m²
    referenceLength: number; // m (caliber)
    totalMass: number; // kg
    totalLength: number; // m
    cnAlpha: number; // normal force coefficient slope
}

// ===========================
// Aerodynamic Forces
// ===========================

export interface AeroForces {
    cd: number; // total drag coefficient
    cdFriction: number;
    cdPressure: number;
    cdBase: number;
    cnAlpha: number; // normal force slope
    cp: number; // center of pressure position
}

// ===========================
// Application State
// ===========================

export type ViewMode = 'design' | 'simulation' | 'analysis';
export type ViewOrientation = 'side' | 'back' | '3d';

export interface FlightConfiguration {
    id: string;
    name: string;
    motorConfigs: Map<string, MotorConfig>; // componentId -> motor config
}
