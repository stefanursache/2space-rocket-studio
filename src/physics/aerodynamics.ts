// ===========================
// Aerodynamics Engine
// ===========================
// Extended Barrowman method for stability calculation
// Drag computation with friction, pressure, base, and interference drag

import {
    Rocket, RocketComponent, NoseCone, BodyTube, Transition,
    TrapezoidFinSet, EllipticalFinSet, FreeformFinSet, Airbrakes, AeroForces, StabilityData, Stage, Motor, StabilityModelOptions
} from '../types/rocket';
import { getAtmosphere, getReynoldsNumber, getMachNumber } from './atmosphere';
import { SURFACE_ROUGHNESS } from '../models/materials';
import { calculateNaca1307, calculateFinInBodyFactor } from './naca1307';

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
            void height;
            const denom = rootChord + tipChord;
            if (denom <= 0) return rootChord / 2;
            const xCentroid =
                sweepLength * (rootChord + 2 * tipChord) / (3 * denom) +
                (rootChord * rootChord + rootChord * tipChord + tipChord * tipChord) / (3 * denom);
            return xCentroid;
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

    const collectComponentMass = (comp: RocketComponent, origin: number): { mass: number; moment: number } => {
        const ownMass = getComponentMass(comp);
        const ownMoment = ownMass * (origin + getComponentCG(comp));
        const children = getComponentChildren(comp);
        let subtreeMass = ownMass;
        let subtreeMoment = ownMoment;

        for (const child of children) {
            const childOffset = getChildOffset(child);
            const childResult = collectComponentMass(child, origin + childOffset);
            subtreeMass += childResult.mass;
            subtreeMoment += childResult.moment;
        }

        // OpenRocket's component-level mass override can represent the complete
        // component subtree. Scale all rigid bodies together when requested so
        // the inherited CG remains physically consistent.
        if (comp.massOverridden && comp.subcomponentsMassOverridden && comp.mass !== undefined && subtreeMass > 0) {
            const scale = comp.mass / subtreeMass;
            subtreeMass = comp.mass;
            subtreeMoment *= scale;
        }
        if (comp.cgOverridden && comp.subcomponentsCGOverridden && comp.cgOverride !== undefined && subtreeMass > 0) {
            subtreeMoment = subtreeMass * (origin + comp.cgOverride);
        }
        return { mass: subtreeMass, moment: subtreeMoment };
    };

    for (const stage of rocket.stages) {
        for (const comp of stage.components) {
            const compLen = getCompLength(comp);
            const componentMass = collectComponentMass(comp, x);
            totalMass += componentMass.mass;
            momentSum += componentMass.moment;

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

function getComponentChildren(comp: RocketComponent): RocketComponent[] {
    switch (comp.type) {
        case 'bodytube':
        case 'innertube':
        case 'nosecone':
            return comp.children ?? [];
        default:
            return [];
    }
}

function getChildOffset(comp: RocketComponent): number {
    if ('position' in comp && typeof comp.position === 'number') {
        return comp.position;
    }
    return 0;
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

    // If there is effectively no area change, this component contributes no normal force.
    // Return a finite CP to avoid 0 * NaN contaminating global CP moment accumulation.
    if (Math.abs(A2 - A1) < 1e-12) {
        return { cnAlpha: 0, cp: xPos + l / 2 };
    }

    // OpenRocket's SymmetricComponentCalc uses the Barrowman frustum result:
    // x_cp = (L*A_aft - V) / (A_aft - A_fore).
    // This is the aerodynamic center, not the volume centroid.
    const volume = (Math.PI * l / 3) * (r1 * r1 + r1 * r2 + r2 * r2);
    const cpLocal = Math.abs(A2 - A1) > 1e-12
        ? (l * A2 - volume) / (A2 - A1)
        : l / 2;
    const cp = xPos + cpLocal;

    return { cnAlpha, cp };
}

function trapezoidFinCP(
    fin: TrapezoidFinSet,
    xPos: number,
    bodyRadius: number,
    refArea: number,
    mach: number
): { cnAlpha: number; cp: number } {
    const { finCount, rootChord, tipChord, height, sweepLength } = fin;
    if (refArea <= 0 || finCount <= 0 || height <= 0 || rootChord < 0 || tipChord < 0 || (rootChord + tipChord) <= 0) {
        return { cnAlpha: 0, cp: xPos };
    }
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
    const area = 0.5 * (Cr + Ct) * s;
    const cosGamma = Math.max(s / lm, 1e-6);
    const aspectRatio = s * s / (area * cosGamma);
    const cnAlpha1 = finCNa(area, s, cosGamma, aspectRatio, refArea, mach);

    // Fin-body interference factor (Barrowman) — uses LOCAL body radius
    const naca = calculateNaca1307(mach, r, s, Cr, Ct, Xs, Cr);
    const KfB = naca?.finLiftFactor ?? calculateFinInBodyFactor(r / (s + r));

    // Total CNα for all fins
    const cnAlpha = cnAlpha1 * finInterference(finCount) * KfB * finCount;

    // CP position of fin set
    const mac = Cr - 2 * (Cr - Ct) * (0.5 * Cr + Ct) / (3 * (Cr + Ct));
    const macLead = Xs + (Cr - mac) / 2;
    const cpFraction = mach >= 2
        ? supersonicCpFraction((s * s / area) * Math.sqrt(Math.max(mach * mach - 1, 0)))
        : 0.25;
    const xf = macLead + cpFraction * mac;

    return {
        cnAlpha,
        cp: xPos + xf,
    };
}

function ellipticalFinCP(
    fin: EllipticalFinSet,
    xPos: number,
    bodyRadius: number,
    refArea: number,
    mach: number
): { cnAlpha: number; cp: number } {
    if (refArea <= 0 || fin.finCount <= 0 || fin.height <= 0 || fin.rootChord <= 0) {
        return { cnAlpha: 0, cp: xPos };
    }
    const s = fin.height;
    const Cr = fin.rootChord;
    const r = bodyRadius; // LOCAL body radius for interference factor

    // Approximate as trapezoidal with tip chord = 0
    const lm = Math.sqrt(s * s + (0.25 * Cr) ** 2);

    // CNα for a SINGLE fin, referenced to vehicle reference area
    // Using π (not 2π) since KfB already accounts for body mirror effect
    const area = Math.PI * Cr * s / 4;
    const cosGamma = Math.max(s / lm, 1e-6);
    const aspectRatio = s * s / (area * cosGamma);
    const cnAlpha1 = finCNa(area, s, cosGamma, aspectRatio, refArea, mach);

    const naca = calculateNaca1307(mach, r, s, Cr, 0, 0, Cr);
    const KfB = naca?.finLiftFactor ?? calculateFinInBodyFactor(r / (s + r));
    const cnAlpha = cnAlpha1 * finInterference(fin.finCount) * KfB * fin.finCount;

    // CP of elliptical fin at about 0.288 * root chord from leading edge
    return {
        cnAlpha,
        cp: xPos + 0.25 * Cr,
    };
}

function freeformFinCP(
    fin: FreeformFinSet,
    xPos: number,
    bodyRadius: number,
    refArea: number,
    mach: number,
): { cnAlpha: number; cp: number } {
    if (fin.finCount <= 0 || fin.points.length < 3 || refArea <= 0) {
        return { cnAlpha: 0, cp: xPos };
    }
    let twiceArea = 0;
    let centroidNumerator = 0;
    let maxSpan = 0;
    for (let i = 0; i < fin.points.length; i++) {
        const [x0, y0] = fin.points[i];
        const [x1, y1] = fin.points[(i + 1) % fin.points.length];
        const cross = x0 * y1 - x1 * y0;
        twiceArea += cross;
        centroidNumerator += (x0 + x1) * cross;
        maxSpan = Math.max(maxSpan, y0, y1);
    }
    const area = Math.abs(twiceArea) / 2;
    if (area <= 1e-12 || maxSpan <= 1e-12) return { cnAlpha: 0, cp: xPos };
    const centroidX = centroidNumerator / (3 * twiceArea);
    const aspectRatio = maxSpan * maxSpan / Math.max(area, 1e-12);
    const cnAlphaSingle = finCNa(area, maxSpan, 1, aspectRatio, refArea, mach);
    const interference = finInterference(fin.finCount) *
        calculateFinInBodyFactor(bodyRadius / (bodyRadius + maxSpan));
    return {
        cnAlpha: cnAlphaSingle * interference * fin.finCount,
        cp: xPos + centroidX,
    };
}

function finInterference(finCount: number): number {
    if (finCount <= 4) return 1;
    if (finCount === 5) return 0.948;
    if (finCount === 6) return 0.913;
    if (finCount === 7) return 0.854;
    if (finCount === 8) return 0.81;
    return 0.75;
}

/**
 * NACA 1307 Eq. 14: lift on a fin mounted to a cylindrical body divided
 * by isolated-fin lift. The chart-based body-load correction is applied
 * separately when the full fin planform is available.
 */
function finCNa(
    area: number,
    span: number,
    cosGamma: number,
    aspectRatio: number,
    refArea: number,
    mach: number,
): number {
    if (area <= 0 || span <= 0 || cosGamma <= 0 || refArea <= 0) return 0;
    // Barrowman's finite-fin expression uses the body-mounted fin
    // denominator 2 + sqrt(4 + beta² AR²).
    const subsonic = 2 * Math.PI * span * span /
        (refArea * (2 + Math.sqrt(4 + (1 - 0.9 ** 2) * aspectRatio ** 2)));
    const m = Math.max(mach, 1.5);
    const beta = Math.sqrt(m * m - 1);
    const supersonic = area * (2 / beta) / refArea;
    if (mach <= 0.9) {
        const betaSub = Math.sqrt(Math.max(1 - mach * mach, 0));
        return 2 * Math.PI * span * span /
            (refArea * (2 + Math.sqrt(4 + betaSub * betaSub * aspectRatio ** 2)));
    }
    if (mach >= 1.5) return supersonic;
    const t = (mach - 0.9) / 0.6;
    return subsonic * (1 - t) + supersonic * t;
}

function supersonicCpFraction(arBeta: number): number {
    if (arBeta <= 0.84) return 0.25;
    if (arBeta >= 1) return (arBeta - 0.67) / (2 * arBeta - 1);
    const t = (arBeta - 0.84) / 0.16;
    const end = (1 - 0.67) / (2 - 1);
    return 0.25 * (2 * t ** 3 - 3 * t ** 2 + 1) +
        end * (-2 * t ** 3 + 3 * t ** 2);
}

export function calculateStability(
    rocket: Rocket,
    motor?: Motor | null,
    motorPosition?: number,
    propellantMassRemaining?: number,
    mach?: number,
    options?: StabilityModelOptions
): StabilityData {
    const positions = getComponentPositions(rocket);
    const refArea = getReferenceArea(rocket);
    const maxR = getMaxRadius(rocket);
    const totalLength = getRocketLength(rocket);
    const { totalMass, cg } = calculateMassAndCG(rocket, motor, motorPosition, propellantMassRemaining);
    const M = mach || 0;

    let bodyCnAlpha = 0;
    let bodyCpMoment = 0;
    let finCnAlpha = 0;
    let finCpMoment = 0;

    // Process each component
    for (const pos of positions) {
        const comp = pos.component;

        if (comp.type === 'nosecone') {
            const { cnAlpha, cp } = noseConeCP(comp);
            const cn = cnAlpha;
            bodyCnAlpha += cn;
            bodyCpMoment += cn * cp;
        }

        if (comp.type === 'transition') {
            const { cnAlpha, cp } = transitionCP(comp, pos.xStart, refArea);
            const cn = cnAlpha;
            bodyCnAlpha += cn;
            bodyCpMoment += cn * cp;
        }

        // Process children (fins)
        if (comp.type === 'bodytube' && comp.children) {
            const bodyRadius = comp.outerRadius;
            for (const child of comp.children) {
                const childOffset = ('position' in child && typeof (child as any).position === 'number')
                    ? (child as any).position : 0;
                if (child.type === 'trapezoidfinset') {
                    const finPos = pos.xStart + childOffset;
                    const { cnAlpha, cp } = trapezoidFinCP(child, finPos, bodyRadius, refArea, M);
                    const cn = cnAlpha;
                    finCnAlpha += cn;
                    finCpMoment += cn * cp;
                }
                if (child.type === 'ellipticalfinset') {
                    const finPos = pos.xStart + childOffset;
                    const { cnAlpha, cp } = ellipticalFinCP(child, finPos, bodyRadius, refArea, M);
                    const cn = cnAlpha;
                    finCnAlpha += cn;
                    finCpMoment += cn * cp;
                }
                if (child.type === 'freeformfinset') {
                    const finPos = pos.xStart + childOffset;
                    const { cnAlpha, cp } = freeformFinCP(child, finPos, bodyRadius, refArea, M);
                    finCnAlpha += cnAlpha;
                    finCpMoment += cnAlpha * cp;
                }
            }
        }
    }

    let totalCnAlpha = bodyCnAlpha + finCnAlpha;
    let cpMoment = bodyCpMoment + finCpMoment;

    if (options?.model === 'extended-high-alpha') {
        const alphaDeg = Math.max(0, Math.min(45, options.alphaDeg ?? 12));
        const alpha = alphaDeg * Math.PI / 180;
        const sin2 = Math.sin(alpha) ** 2;
        const cosA = Math.max(0.25, Math.cos(alpha));

        const bodyScale = 1 + 1.1 * sin2;
        const finScale = Math.max(0.4, cosA);
        const bodyAftShift = 0.08 * totalLength * sin2;

        const bodyCnAdjusted = bodyCnAlpha * bodyScale;
        const bodyMomentAdjusted = bodyScale * (bodyCpMoment + bodyCnAlpha * bodyAftShift);
        const finCnAdjusted = finCnAlpha * finScale;
        const finMomentAdjusted = finCpMoment * finScale;

        totalCnAlpha = bodyCnAdjusted + finCnAdjusted;
        cpMoment = bodyMomentAdjusted + finMomentAdjusted;
    }

    const rawCpPosition = totalCnAlpha > 0 ? cpMoment / totalCnAlpha : 0;
    const cpPosition = Number.isFinite(rawCpPosition)
        ? Math.max(0, Math.min(totalLength, rawCpPosition))
        : 0;
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

    const NOSE_DRAG_TABLES: Record<string, { mach: number[]; cd: number[] }> = {
        ellipsoid: {
            mach: [1.2, 1.25, 1.3, 1.4, 1.6, 2, 2.4],
            cd: [0.110, 0.128, 0.140, 0.148, 0.152, 0.159, 0.162],
        },
        haack: {
            mach: [0.9, 0.95, 1, 1.05, 1.1, 1.2, 1.4, 1.6, 2, 3],
            cd: [0, 0.010, 0.027, 0.055, 0.070, 0.081, 0.095, 0.097, 0.091, 0.083],
        },
        parabolic: {
            mach: [0.95, 0.975, 1, 1.05, 1.1, 1.2, 1.4, 1.7],
            cd: [0, 0.016, 0.041, 0.092, 0.109, 0.119, 0.113, 0.108],
        },
    };

    function interpolateNoseTable(mach: number, table: { mach: number[]; cd: number[] }): number {
        if (mach <= table.mach[0]) return table.cd[0];
        for (let i = 1; i < table.mach.length; i++) {
            if (mach <= table.mach[i]) {
                const t = (mach - table.mach[i - 1]) / (table.mach[i] - table.mach[i - 1]);
                return table.cd[i - 1] + t * (table.cd[i] - table.cd[i - 1]);
            }
        }
        return table.cd[table.cd.length - 1];
    }

    function openRocketNosePressureDrag(nose: NoseCone, mach: number): number {
        const fineness = nose.length / Math.max(2 * nose.baseRadius, 1e-9);
        const table = NOSE_DRAG_TABLES[nose.shape];
        if (table) {
            const reference = Math.max(interpolateNoseTable(mach, table), 1e-9);
            const scale = Math.log(fineness + 1) / Math.log(4);
            return stagnationCD(Math.max(mach, 0)) * Math.pow(
                reference / stagnationCD(Math.max(mach, 0)), scale,
            );
        }

        const sinPhi = nose.baseRadius /
            Math.sqrt(nose.baseRadius ** 2 + nose.length ** 2);
        if (mach < 1) return 0.8 * sinPhi ** 2;
        if (mach < 1.3) {
            const t = (mach - 1) / 0.3;
            const smooth = t * t * (3 - 2 * t);
            const atOne = sinPhi;
            const atOneThree = 2.1 * sinPhi ** 2 + 0.6019 * sinPhi;
            return atOne + smooth * (atOneThree - atOne);
        }
        return 2.1 * sinPhi ** 2 + 0.5 * sinPhi / Math.sqrt(mach ** 2 - 1);
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
        return { cd: 0, cdFriction: 0, cdPressure: 0, cdBase: 0, cdAirbrakes: 0, cnAlpha: stab.cnAlpha, cp: stab.cp };
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
            cdPressure += openRocketNosePressureDrag(nose, mach);
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

    // === Airbrakes Drag (fully deployed, for static analysis) ===
    // In the simulation loop, deployFraction is managed dynamically.
    // Here we report the fully-deployed value so the analysis panel shows
    // the maximum airbrakes contribution.
    const cdAirbrakes = calculateAirbrakesDrag(rocket, refArea, 1.0);

    const cd = cdFriction + cdPressure + cdBase + cdAirbrakes;
    const stab = calculateStability(rocket, motor, motorPosition, propellantMassRemaining, mach);

    return {
        cd,
        cdFriction,
        cdPressure,
        cdBase,
        cdAirbrakes,
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
 * Compute the flat-plate drag coefficient of an airbrake blade from its geometry.
 *
 * Uses Hoerner's empirical data (Fluid Dynamic Drag, Ch. 3) for rectangular
 * flat plates normal to the flow.  Because each blade is mounted flush against
 * the body tube surface, the effective aerodynamic aspect ratio is doubled
 * (mirror/ground-plane effect).
 *
 * Hoerner data (flat rectangular plate, AR = span/chord):
 *   AR   Cd
 *   1    1.17
 *   2    1.19
 *   5    1.20
 *  10    1.29
 *  20    1.49
 *   ∞    1.98
 *
 * @param bladeHeight  Blade span (m) – the dimension that sticks out from the body
 * @param bladeWidth   Blade chord (m) – streamwise dimension
 * @returns            Flat-plate Cd for the blade (referenced to plate area)
 */
export function computeFlatPlateCd(bladeHeight: number, bladeWidth: number): number {
    if (bladeWidth <= 0 || bladeHeight <= 0) return 1.17;

    // Wall-mounted AR: effective AR is doubled because the body acts as a mirror plane
    const arEff = 2 * bladeHeight / bladeWidth;

    // Piecewise-linear interpolation of Hoerner's table
    const table: [number, number][] = [
        [0.5, 1.12],
        [1.0, 1.17],
        [2.0, 1.19],
        [5.0, 1.20],
        [10.0, 1.29],
        [20.0, 1.49],
        [40.0, 1.70],
    ];

    if (arEff <= table[0][0]) return table[0][1];
    if (arEff >= table[table.length - 1][0]) {
        // Asymptote toward 1.98 for infinite AR
        const last = table[table.length - 1];
        return last[1] + (1.98 - last[1]) * (1 - last[0] / arEff);
    }

    for (let i = 0; i < table.length - 1; i++) {
        if (arEff >= table[i][0] && arEff <= table[i + 1][0]) {
            const t = (arEff - table[i][0]) / (table[i + 1][0] - table[i][0]);
            return table[i][1] + t * (table[i + 1][1] - table[i][1]);
        }
    }
    return 1.17;
}

/**
 * Get the effective flat-plate Cd for an airbrakes device.
 * If cdAutoCalculate is true, computes from blade geometry using Hoerner's data.
 * Otherwise uses the manually set comp.cd value.
 */
export function getEffectiveAirbrakeCd(ab: Airbrakes): number {
    if (ab.cdAutoCalculate) {
        return computeFlatPlateCd(ab.bladeHeight, ab.bladeWidth);
    }
    return ab.cd;
}

/**
 * Calculate the drag coefficient contribution from a single airbrakes device.
 * Uses flat plate drag model:
 *   ΔCd = Cd_plate × bladeCount × (bladeWidth × bladeHeight × sin(deployAngle)) / A_ref
 *
 * @param ab           The airbrakes component
 * @param refArea      Rocket reference area (body cross-section, m²)
 * @param deployFraction  0..1, how far the blades are currently deployed
 * @returns            The additive ΔCd to add to the rocket's total drag coefficient
 */
export function calculateSingleAirbrakeDrag(
    ab: Airbrakes,
    refArea: number,
    deployFraction: number
): number {
    if (deployFraction <= 0 || refArea <= 0) return 0;
    const angle = (ab.maxDeployAngle * Math.PI / 180) * deployFraction;
    // Projected area of one blade normal to the flow
    const perBladeProjected = ab.bladeWidth * ab.bladeHeight * Math.sin(angle);
    // Use auto-calculated or manual Cd
    const cdPlate = getEffectiveAirbrakeCd(ab);
    // Total: Cd_plate × N_blades × A_projected_per_blade / A_ref
    return cdPlate * ab.bladeCount * perBladeProjected / refArea;
}

/**
 * Calculate the total additional drag coefficient from ALL deployed airbrakes.
 * Each device uses its own deployFraction independently.
 *
 * @param rocket          The rocket design
 * @param refArea         Rocket reference area (body cross-section, m²)
 * @param deployFraction  0..1, uniform deploy fraction applied to every airbrake device
 * @returns               The total additive ΔCd from all airbrake devices
 */
export function calculateAirbrakesDrag(
    rocket: Rocket,
    refArea: number,
    deployFraction: number
): number {
    if (deployFraction <= 0 || refArea <= 0) return 0;
    let cdTotal = 0;
    const brakes = findAirbrakes(rocket);
    for (const b of brakes) {
        if (b.type === 'airbrakes') {
            cdTotal += calculateSingleAirbrakeDrag(b as Airbrakes, refArea, deployFraction);
        }
    }
    return cdTotal;
}
