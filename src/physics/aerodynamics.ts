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

function getCompForeRadius(comp: RocketComponent): number {
    switch (comp.type) {
        case 'nosecone': return 0; // tip of nose
        case 'bodytube': return comp.outerRadius;
        case 'transition': return comp.foreRadius;
        default: return 0;
    }
}

function getCompAftRadius(comp: RocketComponent): number {
    switch (comp.type) {
        case 'nosecone': return comp.baseRadius;
        case 'bodytube': return comp.outerRadius;
        case 'transition': return comp.aftRadius;
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

    // Ogive volume formula (better approximation than paraboloid)
    // For tangent ogive: V ≈ π·r²·l · k, where k depends on shape
    let shapeFactor: number;
    switch (nc.shape) {
        case 'conical': shapeFactor = 1 / 3; break;
        case 'ogive': shapeFactor = 0.55; break; // tangent ogive ≈ 0.55
        case 'ellipsoid': shapeFactor = 2 / 3; break;
        case 'parabolic': shapeFactor = 0.5; break;
        case 'haack': shapeFactor = 0.5; break;
        case 'power': shapeFactor = 0.45; break;
        default: shapeFactor = 0.55;
    }

    const outerVol = Math.PI * r * r * l * shapeFactor;
    if (t >= r) return outerVol;
    const innerR = r - t;
    const innerL = Math.max(0, l - t);
    const innerVol = Math.PI * innerR * innerR * innerL * shapeFactor;
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
        case 'nosecone': {
            // Hollow nose cone CG is further aft than solid CG
            // Solid ogive CG ≈ 0.466L from tip; hollow shell CG ≈ 0.50-0.55L
            const t = comp.thickness;
            const r = comp.baseRadius;
            if (t >= r) {
                // Solid — use standard shape CG
                return comp.length * 0.466;
            }
            // Hollow shell CG is further back
            // Approximate: blend between solid CG and 0.5L based on wall ratio
            const wallRatio = t / r;
            const solidCG = 0.466;
            const shellCG = 0.52; // thin shell ogive CG
            const cgFraction = solidCG + (shellCG - solidCG) * (1 - wallRatio);
            return comp.length * cgFraction;
        }
        case 'bodytube':
            return comp.length / 2;
        case 'transition': {
            // Frustum (truncated cone) CG from front face:
            // CG = (L/4) * (R1² + 2*R1*R2 + 3*R2²) / (R1² + R1*R2 + R2²)
            const r1 = comp.foreRadius;
            const r2 = comp.aftRadius;
            const l = comp.length;
            const denom = r1 * r1 + r1 * r2 + r2 * r2;
            if (denom === 0) return l / 2;
            return (l / 4) * (r1 * r1 + 2 * r1 * r2 + 3 * r2 * r2) / denom;
        }
        case 'trapezoidfinset': {
            // Centroid of trapezoidal fin (from leading edge of root)
            const { rootChord, tipChord, height, sweepLength } = comp;
            // Centroid x of a trapezoid with parallel sides rootChord and tipChord:
            // x_centroid = sweepLength + (rootChord² + rootChord*tipChord + tipChord²) / (3*(rootChord + tipChord))
            // but measured from root leading edge
            const xCentroid = (sweepLength * (rootChord + 2 * tipChord) +
                (rootChord * rootChord + rootChord * tipChord + tipChord * tipChord) / 3) /
                (rootChord + tipChord);
            // Simplified: just use the x-centroid of the trapezoid shape
            return sweepLength / 3 * (1 + 2 * tipChord / (rootChord + tipChord)) +
                (rootChord + tipChord) > 0
                ? (1 / 6) * (rootChord + tipChord - rootChord * tipChord / (rootChord + tipChord))
                : rootChord / 3;
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
    const { finCount, rootChord, tipChord, height, sweepLength } = fin;
    const s = height; // semi-span
    const Cr = rootChord;
    const Ct = tipChord;
    const Xs = sweepLength;
    const r = bodyRadius; // LOCAL body radius for interference factor

    // Mid-chord sweep line
    const lm = Math.sqrt(s * s + (Xs + 0.5 * Ct - 0.5 * Cr) ** 2);

    // CNα for a SINGLE fin, referenced to vehicle reference area
    // Barrowman: total = 4N(s/d)²/den = Nπs²/(Aref·den) (includes interference)
    // Decomposed: per-fin isolated = πs²/(Aref·den), then × KfB for body interference
    // Note: using π (not 2π) since KfB already accounts for body mirror effect
    const cnAlpha1 = Math.PI * s * s /
        (refArea * (1 + Math.sqrt(1 + (2 * lm / (Cr + Ct)) ** 2)));

    // Fin-body interference factor (Barrowman) — uses LOCAL body radius
    const KfB = 1 + r / (s + r);

    // Total CNα for all fins
    const cnAlpha = cnAlpha1 * KfB * finCount;

    // CP position of fin set
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
    const r = bodyRadius; // LOCAL body radius for interference factor

    // Approximate as trapezoidal with tip chord = 0
    const lm = Math.sqrt(s * s + (0.25 * Cr) ** 2);

    // CNα for a SINGLE fin, referenced to vehicle reference area
    // Using π (not 2π) since KfB already accounts for body mirror effect
    const cnAlpha1 = Math.PI * s * s /
        (refArea * (1 + Math.sqrt(1 + (2 * lm / Cr) ** 2)));

    const KfB = 1 + r / (s + r);
    const cnAlpha = cnAlpha1 * KfB * fin.finCount;

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
    propellantMassRemaining?: number,
    mach?: number
): StabilityData {
    const positions = getComponentPositions(rocket);
    const refArea = getReferenceArea(rocket);
    const maxR = getMaxRadius(rocket);
    const totalLength = getRocketLength(rocket);
    const { totalMass, cg } = calculateMassAndCG(rocket, motor, motorPosition, propellantMassRemaining);
    const M = mach || 0;

    // Compressibility correction factor for CNα
    // Subsonic: Prandtl-Glauert: CNα_comp = CNα_inc / sqrt(1 - M²)
    // Supersonic: linearized theory: CNα_comp = CNα_inc / sqrt(M² - 1) (capped)
    let compFactor = 1.0;
    if (M > 0.3 && M < 0.95) {
        compFactor = 1.0 / Math.sqrt(1 - M * M);
    } else if (M >= 0.95 && M <= 1.05) {
        // Transonic: cap at M=0.95 value to avoid singularity
        compFactor = 1.0 / Math.sqrt(1 - 0.95 * 0.95); // ≈ 3.2
    } else if (M > 1.05) {
        // Supersonic: Ackeret/linearized theory
        compFactor = 1.0 / Math.sqrt(M * M - 1);
    }

    let totalCnAlpha = 0;
    let cpMoment = 0;

    // Process each component
    for (const pos of positions) {
        const comp = pos.component;

        if (comp.type === 'nosecone') {
            const { cnAlpha, cp } = noseConeCP(comp);
            const cn = cnAlpha * compFactor;
            totalCnAlpha += cn;
            cpMoment += cn * cp;
        }

        if (comp.type === 'transition') {
            const { cnAlpha, cp } = transitionCP(comp, pos.xStart, refArea);
            const cn = cnAlpha * compFactor;
            totalCnAlpha += cn;
            cpMoment += cn * cp;
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
                    const cn = cnAlpha * compFactor;
                    totalCnAlpha += cn;
                    cpMoment += cn * cp;
                }
                if (child.type === 'ellipticalfinset') {
                    const finPos = pos.xStart + childOffset;
                    const { cnAlpha, cp } = ellipticalFinCP(child, finPos, bodyRadius, refArea);
                    const cn = cnAlpha * compFactor;
                    totalCnAlpha += cn;
                    cpMoment += cn * cp;
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

/**
 * Calculate skin friction coefficient (Cf) matching OpenRocket's BarrowmanDragCalculator.
 *
 * OpenRocket approach (non-perfect finish):
 *   Re < 1e4:  Cf = 1.48e-2  (constant)
 *   Re >= 1e4: Cf = 1 / (1.50·ln(Re) - 5.6)²  (fully turbulent)
 *
 * Compressibility corrections (two-factor method):
 *   c1 (subsonic, M < 1.1):  1 - 0.1·M²
 *   c2 (supersonic, M > 0.9): 1 / (1 + 0.15·M²)^0.58
 *   Transonic (0.9 < M < 1.1): linear blend of c1 and c2
 *
 * Roughness-limited Cf = max(Cf, roughnessLimited)
 * where roughnessLimited = 0.032 · (roughness/length)^0.2 · roughnessCorrection(M)
 */
function frictionCoefficient(Re: number, mach: number, roughness: number, length: number): number {
    if (Re < 1) return 0;

    let Cf: number;

    // Base Cf (non-perfect finish — fully turbulent)
    if (Re < 1e4) {
        Cf = 1.48e-2;
    } else {
        // Turbulent: matching OpenRocket's formula (natural log)
        const lnRe = Math.log(Re); // natural log
        Cf = 1.0 / Math.pow(1.50 * lnRe - 5.6, 2);
    }

    // Compressibility correction (two-factor method from OpenRocket)
    let c1 = 1.0;
    let c2 = 1.0;

    if (mach < 1.1) {
        c1 = 1 - 0.1 * mach * mach;
    }
    if (mach > 0.9) {
        c2 = 1 / Math.pow(1 + 0.15 * mach * mach, 0.58);
    }

    if (mach < 0.9) {
        Cf *= c1;
    } else if (mach < 1.1) {
        // Transonic: linear blend between c1 and c2
        Cf *= (c2 * (mach - 0.9) / 0.2 + c1 * (1.1 - mach) / 0.2);
    } else {
        Cf *= c2;
    }

    // Roughness-limited Cf (OpenRocket: max of smooth Cf and rough Cf)
    if (roughness > 0 && length > 0) {
        // Roughness correction factor (Mach-dependent, from OpenRocket)
        let roughnessCorrection: number;
        if (mach < 0.9) {
            roughnessCorrection = 1 - 0.1 * mach * mach;
        } else if (mach > 1.1) {
            roughnessCorrection = 1 / (1 + 0.18 * mach * mach);
        } else {
            const rc1 = 1 - 0.1 * 0.9 * 0.9;
            const rc2 = 1.0 / (1 + 0.18 * 1.1 * 1.1);
            roughnessCorrection = rc2 * (mach - 0.9) / 0.2 + rc1 * (1.1 - mach) / 0.2;
        }
        const roughnessLimited = 0.032 * Math.pow(roughness / length, 0.2) * roughnessCorrection;
        Cf = Math.max(Cf, roughnessLimited);
    }

    return Cf;
}

// Stagnation pressure coefficient (OpenRocket BarrowmanDragCalculator)
function stagnationCD(mach: number): number {
    if (mach <= 1) {
        return 0.85 * (1 + mach * mach / 4 + Math.pow(mach, 4) / 40);
    } else {
        return 0.85 * (1.84 - 0.76 / (mach * mach) + 0.166 / Math.pow(mach, 4) + 0.035 / Math.pow(mach, 6));
    }
}

// Base drag coefficient (OpenRocket BarrowmanDragCalculator)
function baseDragCoefficient(mach: number): number {
    if (mach <= 1) {
        return 0.12 + 0.13 * mach * mach;
    } else {
        return 0.25 / mach;
    }
}

export function calculateDrag(
    rocket: Rocket,
    velocity: number,
    altitude: number,
    motor?: Motor | null,
    motorPosition?: number,
    propellantMassRemaining?: number,
    baseTemp?: number,
    basePressure?: number
): AeroForces {
    const atm = getAtmosphere(altitude, baseTemp, basePressure);
    const positions = getComponentPositions(rocket);
    const refArea = getReferenceArea(rocket);
    const maxR = getMaxRadius(rocket);
    const totalLength = getRocketLength(rocket);

    if (velocity === 0 || refArea === 0) {
        const stab = calculateStability(rocket, motor, motorPosition, propellantMassRemaining, 0);
        return { cd: 0, cdFriction: 0, cdPressure: 0, cdBase: 0, cnAlpha: stab.cnAlpha, cp: stab.cp };
    }

    const Re = getReynoldsNumber(velocity, totalLength, atm.kinematicViscosity);
    const mach = getMachNumber(velocity, atm.speedOfSound);

    // Check if motor is firing (for base drag reduction)
    const motorFiring = motor && propellantMassRemaining !== undefined && propellantMassRemaining > 0;

    // === Friction Drag ===
    // OpenRocket approach: compute a single Cf for the full rocket length,
    // then apply per-component wetted area. Body friction gets a fineness ratio correction.
    let cdFriction = 0;
    let bodyFrictionCD = 0;
    let otherFrictionCD = 0;
    let maxBodyR = 0;
    let minBodyX = Infinity;
    let maxBodyX = 0;

    for (const pos of positions) {
        const comp = pos.component;
        let wetArea = 0;
        const roughness = SURFACE_ROUGHNESS[comp.finish];

        // Per-component roughness-limited Cf
        const componentCf = frictionCoefficient(Re, mach, roughness, totalLength);

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
            const cd = componentCf * wetArea / refArea;
            bodyFrictionCD += cd;

            // Track body extent for fineness ratio correction
            minBodyX = Math.min(minBodyX, pos.xStart);
            maxBodyX = Math.max(maxBodyX, pos.xEnd);
            const r = getCompRadius(comp);
            maxBodyR = Math.max(maxBodyR, r);
        }

        // Fin friction drag (OpenRocket FinSetCalc formula)
        if (comp.type === 'bodytube' && comp.children) {
            for (const child of comp.children) {
                if (child.type === 'trapezoidfinset') {
                    const finArea = 0.5 * (child.rootChord + child.tipChord) * child.height;
                    const finCount = child.finCount;
                    const t = child.thickness;
                    // MAC length for trapezoidal fin
                    const Cr = child.rootChord;
                    const Ct = child.tipChord;
                    const macLength = Cr - 2 * (Cr - Ct) * (0.5 * Cr + Ct) / (3 * (Cr + Ct));
                    // OpenRocket: cd = Cf * (1 + 2*t/mac) * 2 * finArea / Aref
                    const finCf = frictionCoefficient(Re, mach, roughness, totalLength);
                    const thicknessFactor = macLength > 0 ? (1 + 2 * t / macLength) : 1;
                    otherFrictionCD += finCf * thicknessFactor * 2 * finArea * finCount / refArea;
                }
                if (child.type === 'ellipticalfinset') {
                    const finArea = Math.PI * child.rootChord * child.height / 4;
                    const finCount = child.finCount;
                    const t = child.thickness;
                    const macLength = child.rootChord * 0.8488; // MAC of elliptical planform
                    const finCf = frictionCoefficient(Re, mach, roughness, totalLength);
                    const thicknessFactor = macLength > 0 ? (1 + 2 * t / macLength) : 1;
                    otherFrictionCD += finCf * thicknessFactor * 2 * finArea * finCount / refArea;
                }
                if (child.type === 'launchlug') {
                    otherFrictionCD += 0.01; // approximate
                }
            }
        }
    }

    // Body fineness ratio correction (OpenRocket: (1 + 1/(2*fB)))
    // fB = body length / max body radius
    if (maxBodyR > 0) {
        const fB = (maxBodyX - minBodyX + 0.0001) / maxBodyR;
        const correction = 1 + 1.0 / (2 * fB);
        bodyFrictionCD *= correction;
    }

    cdFriction = bodyFrictionCD + otherFrictionCD;

    // === Pressure Drag ===
    let cdPressure = 0;

    // Nose cone pressure drag (OpenRocket uses experimental interpolation from NASA TR-R-100)
    // We approximate with fineness-ratio dependent correlations for each shape
    for (const pos of positions) {
        if (pos.component.type === 'nosecone') {
            const nose = pos.component;
            const fineRatio = nose.length / (nose.baseRadius * 2);

            // Subsonic pressure drag at M=0 (base value, fineness~3 reference)
            let cdNose: number;
            switch (nose.shape) {
                case 'conical':
                    cdNose = 0.50 / (fineRatio * fineRatio);
                    break;
                case 'ogive':
                    cdNose = 0.18 / (fineRatio * fineRatio);
                    break;
                case 'ellipsoid':
                    cdNose = 0.10 / (fineRatio * fineRatio);
                    break;
                case 'haack': // Von Kármán / Sears-Haack
                    cdNose = 0.08 / (fineRatio * fineRatio);
                    break;
                default:
                    cdNose = 0.15 / (fineRatio * fineRatio);
            }

            // Transonic and supersonic: scale with Mach-dependent factor
            // OpenRocket uses Prandtl-Glauert style for subsonic, wave drag for supersonic
            if (mach > 0.8 && mach < 1.0) {
                // Transonic drag rise
                const t = (mach - 0.8) / 0.2;
                const ramp = 3 * t * t - 2 * t * t * t;
                let peakCd: number;
                switch (nose.shape) {
                    case 'conical': peakCd = 0.8 / (fineRatio * fineRatio); break;
                    case 'ogive': peakCd = 0.5 / Math.pow(fineRatio, 1.5); break;
                    case 'haack': peakCd = 0.3 / Math.pow(fineRatio, 1.5); break;
                    case 'ellipsoid': peakCd = 0.6 / Math.pow(fineRatio, 1.5); break;
                    default: peakCd = 0.5 / Math.pow(fineRatio, 1.5);
                }
                cdNose = cdNose + (peakCd - cdNose) * ramp;
            } else if (mach >= 1.0) {
                let peakCd: number;
                switch (nose.shape) {
                    case 'conical': peakCd = 0.8 / (fineRatio * fineRatio); break;
                    case 'ogive': peakCd = 0.5 / Math.pow(fineRatio, 1.5); break;
                    case 'haack': peakCd = 0.3 / Math.pow(fineRatio, 1.5); break;
                    case 'ellipsoid': peakCd = 0.6 / Math.pow(fineRatio, 1.5); break;
                    default: peakCd = 0.5 / Math.pow(fineRatio, 1.5);
                }
                const mEff = Math.max(mach, 1.05);
                cdNose = peakCd / Math.sqrt(mEff * mEff - 1);
            }

            cdPressure += cdNose;
        }
    }

    // Pressure drag at body diameter transitions (OpenRocket: stagnation pressure)
    // Applied where foreRadius of a component > aftRadius of previous component (step increase)
    for (let i = 1; i < positions.length; i++) {
        const prevComp = positions[i - 1].component;
        const curComp = positions[i].component;
        const prevAftR = getCompAftRadius(prevComp);
        const curForeR = getCompForeRadius(curComp);
        if (curForeR > prevAftR && prevAftR >= 0) {
            // Step increase in radius: stagnation pressure drag
            const stepArea = Math.PI * (curForeR * curForeR - prevAftR * prevAftR);
            cdPressure += stagnationCD(mach) * stepArea / refArea;
        }
    }

    // Fin pressure drag (OpenRocket FinSetCalc approach)
    // Uses leading edge stagnation-based formula for rounded/airfoil cross-section
    for (const pos of positions) {
        if (pos.component.type === 'bodytube') {
            const bt = pos.component as BodyTube;
            if (bt.children) {
                for (const child of bt.children) {
                    if (child.type === 'trapezoidfinset' || child.type === 'ellipticalfinset') {
                        const t = child.thickness;
                        const finCount = child.finCount;
                        const span = child.height;
                        const Cr = child.rootChord;

                        // Leading edge angle (sweep angle of leading edge)
                        let gammaLead = 0;
                        if (child.type === 'trapezoidfinset') {
                            const sweep = child.sweepLength;
                            if (span > 0) {
                                gammaLead = Math.atan2(sweep, span);
                            }
                        }

                        // OpenRocket: Leading edge pressure drag for ROUNDED cross section
                        // Subsonic: (1-M²)^(-0.417) - 1
                        // Transonic: 1 - 1.785*(M-0.9)
                        // Supersonic: 1.214 - 0.502/M² + 0.1095/M⁴ + 0.0231/M⁶
                        let cdLE: number;
                        if (mach < 0.9) {
                            cdLE = Math.pow(1 - mach * mach, -0.417) - 1;
                        } else if (mach < 1.0) {
                            cdLE = 1 - 1.785 * (mach - 0.9);
                        } else {
                            cdLE = 1.214 - 0.502 / (mach * mach) + 0.1095 / Math.pow(mach, 4) + 0.0231 / Math.pow(mach, 6);
                        }

                        // Scale by cos²(sweep) for swept leading edge
                        const cosGamma = Math.cos(gammaLead);
                        cdLE *= cosGamma * cosGamma;

                        // Trailing edge pressure drag (same formula structure for blunt TE)
                        // OpenRocket: uses base drag coefficient for trailing edge
                        const cdTE = baseDragCoefficient(mach);

                        // Total: LE + TE, scaled by span*thickness/refArea
                        let cdFin = (cdLE + cdTE) * span * t * finCount / refArea;

                        cdPressure += cdFin;
                    }
                }
            }
        }
    }

    // === Base Drag ===
    // OpenRocket: apply base drag at every aft-to-fore area decrease along the body,
    // including the final aft end of the rocket (open area to atmosphere).
    // Formula: baseDragCoefficient(M) * π*(aftR² - nextR²) / refArea
    let cdBase = 0;
    const cdBaseCoeff = baseDragCoefficient(mach);

    for (let i = 0; i < positions.length; i++) {
        const comp = positions[i].component;
        const aftR = getCompAftRadius(comp);
        // Next component's fore radius (0 if last component = open to air)
        const nextForeR = (i < positions.length - 1) ? getCompForeRadius(positions[i + 1].component) : 0;

        if (aftR > nextForeR) {
            const areaDecrease = Math.PI * (aftR * aftR - nextForeR * nextForeR);
            cdBase += cdBaseCoeff * areaDecrease / refArea;
        }
    }

    // Motor-on base drag reduction: exhaust fills low-pressure base region
    if (motorFiring) {
        cdBase *= 0.5;
    }

    const cd = cdFriction + cdPressure + cdBase;
    const stab = calculateStability(rocket, motor, motorPosition, propellantMassRemaining, mach);

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

// Find airbrakes components
export function findAirbrakes(rocket: Rocket): RocketComponent[] {
    const brakes: RocketComponent[] = [];
    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            if (comp.type === 'bodytube' && comp.children) {
                for (const child of comp.children) {
                    if (child.type === 'airbrakes') {
                        brakes.push(child);
                    }
                }
            }
        }
    }
    return brakes;
}

/**
 * Calculate the additional drag coefficient from deployed airbrakes.
 * Uses flat plate drag model: Cd_airbrakes = Cd * n * A_projected / A_ref
 * where A_projected = bladeWidth * bladeHeight * sin(deployAngle)
 */
export function calculateAirbrakesDrag(
    rocket: Rocket,
    refArea: number,
    deployFraction: number // 0..1, how much the airbrakes are deployed
): number {
    if (deployFraction <= 0 || refArea <= 0) return 0;
    let cdAirbrakes = 0;
    const brakes = findAirbrakes(rocket);
    for (const b of brakes) {
        if (b.type === 'airbrakes') {
            const ab = b as any;
            const angle = (ab.maxDeployAngle * Math.PI / 180) * deployFraction;
            // Projected area of one blade = chord * span * sin(angle)
            const projectedArea = ab.bladeWidth * ab.bladeHeight * Math.sin(angle);
            cdAirbrakes += ab.cd * ab.bladeCount * projectedArea / refArea;
        }
    }
    return cdAirbrakes;
}
