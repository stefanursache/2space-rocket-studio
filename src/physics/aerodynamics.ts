// ===========================
// Aerodynamics Engine
// ===========================
// Extended Barrowman method for stability calculation
// Drag computation with friction, pressure, base, and interference drag

import {
    Rocket, RocketComponent, NoseCone, BodyTube, Transition,
    TrapezoidFinSet, EllipticalFinSet, AeroForces, StabilityData, Stage, Motor
} from '../types/rocket';
import { getAtmosphere, getReynoldsNumber, getMachNumber } from './atmosphere';
import { SURFACE_ROUGHNESS } from '../models/materials';

// ===========================
// Geometry Helpers
// ===========================

interface ComponentPosition {
    component: RocketComponent;
    xStart: number; // position from nose tip
    xEnd: number;
    radius: number;
}

export function getComponentPositions(rocket: Rocket): ComponentPosition[] {
    const positions: ComponentPosition[] = [];
    let x = 0;

    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            const len = getCompLength(comp);
            const radius = getCompRadius(comp);
            positions.push({ component: comp, xStart: x, xEnd: x + len, radius });
            x += len;
        }
    }
    return positions;
}

function getCompLength(comp: RocketComponent): number {
    switch (comp.type) {
        case 'nosecone': return comp.length;
        case 'bodytube': return comp.length;
        case 'transition': return comp.length;
        default: return 0;
    }
}

function getCompRadius(comp: RocketComponent): number {
    switch (comp.type) {
        case 'nosecone': return comp.baseRadius;
        case 'bodytube': return comp.outerRadius;
        case 'transition': return Math.max(comp.foreRadius, comp.aftRadius);
        default: return 0;
    }
}

export function getRocketLength(rocket: Rocket): number {
    let length = 0;
    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            length += getCompLength(comp);
        }
    }
    return length;
}

export function getMaxRadius(rocket: Rocket): number {
    let maxR = 0;
    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            const r = getCompRadius(comp);
            if (r > maxR) maxR = r;
        }
    }
    return maxR;
}

export function getReferenceArea(rocket: Rocket): number {
    const r = getMaxRadius(rocket);
    return Math.PI * r * r;
}

// ===========================
// Mass & CG Calculation
// ===========================

function getNoseConeVolume(nc: NoseCone): number {
    const r = nc.baseRadius;
    const l = nc.length;
    const t = nc.thickness;
    // Approximate as solid ogive minus inner ogive
    const outerVol = (2 / 3) * Math.PI * r * r * l;
    if (t >= r) return outerVol;
    const innerR = r - t;
    const innerVol = (2 / 3) * Math.PI * innerR * innerR * (l - t);
    return outerVol - Math.max(0, innerVol);
}

function getBodyTubeVolume(bt: BodyTube): number {
    return Math.PI * (bt.outerRadius * bt.outerRadius - bt.innerRadius * bt.innerRadius) * bt.length;
}

function getTransitionVolume(tr: Transition): number {
    const l = tr.length;
    const r1 = tr.foreRadius;
    const r2 = tr.aftRadius;
    const t = tr.thickness;
    const outerVol = (Math.PI * l / 3) * (r1 * r1 + r1 * r2 + r2 * r2);
    const ir1 = Math.max(0, r1 - t);
    const ir2 = Math.max(0, r2 - t);
    const innerVol = (Math.PI * l / 3) * (ir1 * ir1 + ir1 * ir2 + ir2 * ir2);
    return outerVol - innerVol;
}

function getTrapFinVolume(fin: TrapezoidFinSet): number {
    const area = 0.5 * (fin.rootChord + fin.tipChord) * fin.height;
    return area * fin.thickness * fin.finCount;
}

function getEllipFinVolume(fin: EllipticalFinSet): number {
    const area = Math.PI * fin.rootChord * fin.height / 4;
    return area * fin.thickness * fin.finCount;
}

function getComponentMass(comp: RocketComponent): number {
    if (comp.massOverridden && comp.mass !== undefined) return comp.mass;

    const density = comp.material.density;
    let volume = 0;

    switch (comp.type) {
        case 'nosecone':
            volume = getNoseConeVolume(comp);
            break;
        case 'bodytube':
            volume = getBodyTubeVolume(comp);
            break;
        case 'transition':
            volume = getTransitionVolume(comp);
            break;
        case 'trapezoidfinset':
            volume = getTrapFinVolume(comp);
            break;
        case 'ellipticalfinset':
            volume = getEllipFinVolume(comp);
            break;
        case 'freeformfinset': {
            // approximate
            let area = 0;
            const pts = comp.points;
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
            }
            area = Math.abs(area) / 2;
            volume = area * comp.thickness * comp.finCount;
            break;
        }
        case 'innertube':
            volume = Math.PI * (comp.outerRadius ** 2 - comp.innerRadius ** 2) * comp.length;
            break;
        case 'engineblock':
            volume = Math.PI * (comp.outerRadius ** 2 - comp.innerRadius ** 2) * comp.length;
            break;
        case 'centeringring':
            volume = Math.PI * (comp.outerRadius ** 2 - comp.innerRadius ** 2) * comp.length;
            break;
        case 'bulkhead':
            volume = Math.PI * comp.outerRadius ** 2 * comp.length;
            break;
        case 'launchlug':
            volume = Math.PI * (comp.outerRadius ** 2 - comp.innerRadius ** 2) * comp.length;
            break;
        case 'parachute': {
            const area = Math.PI * (comp.diameter / 2) ** 2;
            return area * comp.material.density + comp.lineCount * comp.lineLength * 0.004;
        }
        case 'streamer':
            return comp.stripLength * comp.stripWidth * comp.material.density;
        case 'shockcord':
            return comp.cordLength * comp.material.density;
        case 'massobject':
            return comp.componentMass;
        case 'tubecoupler':
            volume = Math.PI * (comp.outerRadius ** 2 - comp.innerRadius ** 2) * comp.length;
            break;
    }

    return volume * density;
}

function getComponentCG(comp: RocketComponent): number {
    // CG position relative to component front
    if (comp.cgOverridden && comp.cgOverride !== undefined) return comp.cgOverride;

    switch (comp.type) {
        case 'nosecone':
            // Ogive CG approximately at 0.466 * length from tip
            return comp.length * 0.466;
        case 'bodytube':
            return comp.length / 2;
        case 'transition':
            return comp.length / 2;
        case 'trapezoidfinset': {
            // Approximate centroid of trapezoidal fin
            const { rootChord, tipChord, height, sweepLength } = comp;
            const xCentroid = (sweepLength + (rootChord + 2 * tipChord) / (3 * (rootChord + tipChord)) * rootChord);
            return xCentroid / 2;
        }
        default:
            return 0;
    }
}

export function calculateMassAndCG(
    rocket: Rocket,
    motor?: Motor | null,
    motorPosition?: number,
    propellantMassRemaining?: number
): { totalMass: number; cg: number } {
    let totalMass = 0;
    let momentSum = 0;
    let x = 0;

    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            const compLen = getCompLength(comp);
            const mass = getComponentMass(comp);
            const localCG = getComponentCG(comp);

            totalMass += mass;
            momentSum += mass * (x + localCG);

            // Process children (body tube and nose cone)
            const childList = (comp.type === 'bodytube' && comp.children)
                ? comp.children
                : (comp.type === 'nosecone' && (comp as any).children)
                    ? (comp as any).children
                    : null;
            if (childList) {
                for (const child of childList) {
                    const childMass = getComponentMass(child);
                    const childLocalCG = getComponentCG(child);

                    // Position is from front of parent
                    const childOffset = ('position' in child && typeof (child as any).position === 'number')
                        ? (child as any).position : 0;
                    const childPos = x + childOffset;

                    totalMass += childMass;
                    momentSum += childMass * (childPos + childLocalCG);

                    // Process inner tube children
                    if (child.type === 'innertube' && child.children) {
                        const itLen = child.length;
                        for (const grandchild of child.children) {
                            const gcMass = getComponentMass(grandchild);
                            const gcOffset = ('position' in grandchild && typeof (grandchild as any).position === 'number')
                                ? (grandchild as any).position : 0;
                            totalMass += gcMass;
                            momentSum += gcMass * (childPos + gcOffset + getComponentCG(grandchild));
                        }
                    }
                }
            }

            x += compLen;
        }
    }

    // Motor mass contribution to CG
    if (motor && motorPosition !== undefined) {
        const motorLen = motor.length / 1000; // mm to m
        const motorCGPos = motorPosition + motorLen / 2;
        const casingMass = motor.totalMass - motor.propellantMass;
        const propRemaining = propellantMassRemaining !== undefined
            ? propellantMassRemaining : motor.propellantMass;
        const motorMass = casingMass + propRemaining;
        totalMass += motorMass;
        momentSum += motorMass * motorCGPos;
    }

    return {
        totalMass,
        cg: totalMass > 0 ? momentSum / totalMass : 0,
    };
}

// ===========================
// Barrowman Stability Method
// ===========================

function noseConeCP(nose: NoseCone): { cnAlpha: number; cp: number } {
    // Barrowman method for nose cone
    let cpFraction: number;

    switch (nose.shape) {
        case 'conical':
            cpFraction = 2 / 3;
            break;
        case 'ogive':
            cpFraction = 0.466;
            break;
        case 'ellipsoid':
            cpFraction = 1 / 3;
            break;
        case 'power':
            cpFraction = 0.5;
            break;
        case 'parabolic':
            cpFraction = 0.5;
            break;
        case 'haack':
            cpFraction = 0.437;
            break;
        default:
            cpFraction = 0.466;
    }

    return {
        cnAlpha: 2.0, // CNα for nose cone is 2 per Barrowman
        cp: nose.length * cpFraction,
    };
}

function transitionCP(
    trans: Transition,
    xPos: number,
    refArea: number
): { cnAlpha: number; cp: number } {
    const r1 = trans.foreRadius;
    const r2 = trans.aftRadius;
    const l = trans.length;
    const A1 = Math.PI * r1 * r1;
    const A2 = Math.PI * r2 * r2;

    const cnAlpha = 2 * (A2 - A1) / refArea;
    const cp = xPos + l / 3 * (1 + (1 - r1 / r2) / (1 - (r1 / r2) ** 2));

    return { cnAlpha, cp };
}

function trapezoidFinCP(
    fin: TrapezoidFinSet,
    xPos: number,
    bodyRadius: number,
    refArea: number
): { cnAlpha: number; cp: number } {
    const { finCount, rootChord, tipChord, height, sweepLength, thickness } = fin;
    const s = height; // semi-span
    const Cr = rootChord;
    const Ct = tipChord;
    const Xs = sweepLength;
    const d = bodyRadius * 2;
    const r = bodyRadius;

    // Barrowman equations for trapezoidal fins
    const Af = 0.5 * (Cr + Ct) * s; // single fin planform area

    // Mid-chord sweep
    const lm = Math.sqrt(s * s + (Xs + 0.5 * Ct - 0.5 * Cr) ** 2);

    // CNα for a single fin (per radian)
    const num = 16 * (s / d) ** 2;
    const den = 1 + Math.sqrt(1 + (2 * lm / (Cr + Ct)) ** 2);
    const cnAlpha1 = num / den;

    // Fin-body interference factor (Barrowman)
    const KfB = 1 + r / (s + r);
    const cnAlpha = cnAlpha1 * KfB * finCount / 2;

    // CP position of fin
    const xf = Xs * (Cr + 2 * Ct) / (3 * (Cr + Ct)) +
        (1 / 6) * (Cr + Ct - Cr * Ct / (Cr + Ct));

    return {
        cnAlpha,
        cp: xPos + xf,
    };
}

function ellipticalFinCP(
    fin: EllipticalFinSet,
    xPos: number,
    bodyRadius: number,
    refArea: number
): { cnAlpha: number; cp: number } {
    const s = fin.height;
    const Cr = fin.rootChord;
    const d = bodyRadius * 2;
    const r = bodyRadius;

    // Approximate as trapezoidal with tip chord = 0
    const lm = Math.sqrt(s * s + (0.25 * Cr) ** 2);
    const num = 16 * (s / d) ** 2;
    const den = 1 + Math.sqrt(1 + (2 * lm / Cr) ** 2);
    const cnAlpha1 = num / den;

    const KfB = 1 + r / (s + r);
    const cnAlpha = cnAlpha1 * KfB * fin.finCount / 2;

    // CP of elliptical fin at about 0.288 * root chord from leading edge
    return {
        cnAlpha,
        cp: xPos + 0.288 * Cr,
    };
}

export function calculateStability(
    rocket: Rocket,
    motor?: Motor | null,
    motorPosition?: number,
    propellantMassRemaining?: number
): StabilityData {
    const positions = getComponentPositions(rocket);
    const refArea = getReferenceArea(rocket);
    const maxR = getMaxRadius(rocket);
    const totalLength = getRocketLength(rocket);
    const { totalMass, cg } = calculateMassAndCG(rocket, motor, motorPosition, propellantMassRemaining);

    let totalCnAlpha = 0;
    let cpMoment = 0;

    // Process each component
    for (const pos of positions) {
        const comp = pos.component;

        if (comp.type === 'nosecone') {
            const { cnAlpha, cp } = noseConeCP(comp);
            totalCnAlpha += cnAlpha;
            cpMoment += cnAlpha * cp;
        }

        if (comp.type === 'transition') {
            const { cnAlpha, cp } = transitionCP(comp, pos.xStart, refArea);
            totalCnAlpha += cnAlpha;
            cpMoment += cnAlpha * cp;
        }

        // Process children (fins)
        if (comp.type === 'bodytube' && comp.children) {
            const bodyRadius = comp.outerRadius;
            for (const child of comp.children) {
                const childOffset = ('position' in child && typeof (child as any).position === 'number')
                    ? (child as any).position : 0;
                if (child.type === 'trapezoidfinset') {
                    const finPos = pos.xStart + childOffset;
                    const { cnAlpha, cp } = trapezoidFinCP(child, finPos, bodyRadius, refArea);
                    totalCnAlpha += cnAlpha;
                    cpMoment += cnAlpha * cp;
                }
                if (child.type === 'ellipticalfinset') {
                    const finPos = pos.xStart + childOffset;
                    const { cnAlpha, cp } = ellipticalFinCP(child, finPos, bodyRadius, refArea);
                    totalCnAlpha += cnAlpha;
                    cpMoment += cnAlpha * cp;
                }
            }
        }
    }

    const cpPosition = totalCnAlpha > 0 ? cpMoment / totalCnAlpha : 0;
    const caliber = maxR * 2;
    const stabilityMargin = caliber > 0 ? (cpPosition - cg) / caliber : 0;

    return {
        cg,
        cp: cpPosition,
        stabilityMargin,
        referenceArea: refArea,
        referenceLength: caliber,
        totalMass,
        totalLength,
        cnAlpha: totalCnAlpha,
    };
}

// ===========================
// Drag Calculation
// ===========================

function frictionCoefficient(Re: number, roughness: number, length: number): number {
    if (Re < 1) return 0;

    // Laminar or turbulent
    const Re_crit = 5e5;
    let Cf: number;

    if (Re < Re_crit) {
        // Laminar: Blasius solution
        Cf = 1.328 / Math.sqrt(Re);
    } else {
        // Turbulent: Schlichting empirical formula
        Cf = 0.455 / Math.pow(Math.log10(Re), 2.58);
        // Roughness correction
        if (roughness > 0 && length > 0) {
            const CfRough = 1 / Math.pow(1.89 + 1.62 * Math.log10(length / roughness), 2.5);
            Cf = Math.max(Cf, CfRough);
        }
    }

    return Cf;
}

export function calculateDrag(
    rocket: Rocket,
    velocity: number,
    altitude: number
): AeroForces {
    const atm = getAtmosphere(altitude);
    const positions = getComponentPositions(rocket);
    const refArea = getReferenceArea(rocket);
    const maxR = getMaxRadius(rocket);
    const totalLength = getRocketLength(rocket);

    if (velocity === 0 || refArea === 0) {
        const stab = calculateStability(rocket);
        return { cd: 0, cdFriction: 0, cdPressure: 0, cdBase: 0, cnAlpha: stab.cnAlpha, cp: stab.cp };
    }

    const Re = getReynoldsNumber(velocity, totalLength, atm.kinematicViscosity);
    const mach = getMachNumber(velocity, atm.speedOfSound);

    // === Friction Drag ===
    let cdFriction = 0;

    for (const pos of positions) {
        const comp = pos.component;
        let wetArea = 0;
        const compLen = pos.xEnd - pos.xStart;
        let roughness = SURFACE_ROUGHNESS[comp.finish];

        if (comp.type === 'nosecone') {
            // Wetted area of nose cone (approximate as cone)
            const slantHeight = Math.sqrt(comp.length ** 2 + comp.baseRadius ** 2);
            wetArea = Math.PI * comp.baseRadius * slantHeight;
        } else if (comp.type === 'bodytube') {
            wetArea = 2 * Math.PI * comp.outerRadius * comp.length;
        } else if (comp.type === 'transition') {
            const slantHeight = Math.sqrt(comp.length ** 2 + (comp.aftRadius - comp.foreRadius) ** 2);
            wetArea = Math.PI * (comp.foreRadius + comp.aftRadius) * slantHeight;
        }

        if (wetArea > 0) {
            const Cf = frictionCoefficient(Re * compLen / totalLength, roughness, compLen);
            cdFriction += Cf * wetArea / refArea;
        }

        // Fin friction drag
        if (comp.type === 'bodytube' && comp.children) {
            for (const child of comp.children) {
                if (child.type === 'trapezoidfinset') {
                    const finArea = 0.5 * (child.rootChord + child.tipChord) * child.height;
                    const finWetArea = 2 * finArea * child.finCount; // both sides
                    const Cf = frictionCoefficient(Re * child.rootChord / totalLength, roughness, child.rootChord);
                    cdFriction += Cf * finWetArea / refArea * 1.04; // interference factor
                }
                if (child.type === 'ellipticalfinset') {
                    const finArea = Math.PI * child.rootChord * child.height / 4;
                    const finWetArea = 2 * finArea * child.finCount;
                    const Cf = frictionCoefficient(Re * child.rootChord / totalLength, roughness, child.rootChord);
                    cdFriction += Cf * finWetArea / refArea * 1.04;
                }
                if (child.type === 'launchlug') {
                    cdFriction += 0.01; // approximate
                }
            }
        }
    }

    // Compressibility correction (Prandtl-Glauert)
    if (mach > 0.3 && mach < 1.0) {
        cdFriction /= Math.sqrt(1 - mach * mach);
    }

    // === Pressure Drag ===
    let cdPressure = 0;

    // Nose cone pressure drag
    for (const pos of positions) {
        if (pos.component.type === 'nosecone') {
            const nose = pos.component;
            const fineRatio = nose.length / (nose.baseRadius * 2);
            // Von Kármán approximation
            switch (nose.shape) {
                case 'conical':
                    cdPressure += 0.5 * Math.sin(Math.atan(1 / fineRatio)) ** 2;
                    break;
                case 'ogive':
                    cdPressure += 0.2 / (fineRatio * fineRatio);
                    break;
                case 'ellipsoid':
                    cdPressure += 0.1 / (fineRatio * fineRatio);
                    break;
                case 'haack':
                    cdPressure += 0.08 / (fineRatio * fineRatio);
                    break;
                default:
                    cdPressure += 0.15 / (fineRatio * fineRatio);
            }
        }
    }

    // Fin leading edge pressure drag
    for (const pos of positions) {
        if (pos.component.type === 'bodytube') {
            const bt = pos.component as BodyTube;
            if (bt.children) {
                for (const child of bt.children) {
                    if (child.type === 'trapezoidfinset' || child.type === 'ellipticalfinset') {
                        const t = child.thickness;
                        const finRefArea = child.type === 'trapezoidfinset'
                            ? 0.5 * (child.rootChord + child.tipChord) * child.height
                            : Math.PI * child.rootChord * child.height / 4;
                        const finCount = child.finCount;
                        // Approximate LE pressure drag
                        const cdFinLE = 1.2 * t * child.height * finCount / refArea;
                        cdPressure += cdFinLE;
                    }
                }
            }
        }
    }

    // === Base Drag ===
    let cdBase = 0;
    // Find the aft-most body component
    const lastPos = positions[positions.length - 1];
    if (lastPos) {
        let aftRadius = 0;
        const comp = lastPos.component;
        if (comp.type === 'bodytube') aftRadius = comp.outerRadius;
        else if (comp.type === 'transition') aftRadius = comp.aftRadius;

        if (aftRadius > 0) {
            const baseArea = Math.PI * aftRadius * aftRadius;
            cdBase = 0.12 + 0.13 * mach * mach;
            cdBase *= baseArea / refArea;
        }
    }

    const cd = cdFriction + cdPressure + cdBase;
    const stab = calculateStability(rocket);

    return {
        cd,
        cdFriction,
        cdPressure,
        cdBase,
        cnAlpha: stab.cnAlpha,
        cp: stab.cp,
    };
}

// Helper to find all fin sets
export function findFinSets(rocket: Rocket): RocketComponent[] {
    const fins: RocketComponent[] = [];
    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            if (comp.type === 'bodytube' && comp.children) {
                for (const child of comp.children) {
                    if (child.type === 'trapezoidfinset' || child.type === 'ellipticalfinset' || child.type === 'freeformfinset') {
                        fins.push(child);
                    }
                }
            }
        }
    }
    return fins;
}

// Find all body tubes
export function findBodyTubes(rocket: Rocket): BodyTube[] {
    const tubes: BodyTube[] = [];
    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            if (comp.type === 'bodytube') {
                tubes.push(comp);
            }
        }
    }
    return tubes;
}

// Find motor mounts
export function findMotorMounts(rocket: Rocket): RocketComponent[] {
    const mounts: RocketComponent[] = [];
    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            if (comp.type === 'bodytube') {
                if (comp.isMotorMount) mounts.push(comp);
                if (comp.children) {
                    for (const child of comp.children) {
                        if (child.type === 'innertube' && child.isMotorMount) {
                            mounts.push(child);
                        }
                    }
                }
            }
        }
    }
    return mounts;
}

// Find recovery devices
export function findRecoveryDevices(rocket: Rocket): RocketComponent[] {
    const devices: RocketComponent[] = [];
    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            if (comp.type === 'bodytube' && comp.children) {
                for (const child of comp.children) {
                    if (child.type === 'parachute' || child.type === 'streamer') {
                        devices.push(child);
                    }
                }
            }
        }
    }
    return devices;
}
