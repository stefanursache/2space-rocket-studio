import { getAtmosphere } from './atmosphere';
import { EllipticalFinSet, FreeformFinSet, Material, Rocket, SimulationResult, TrapezoidFinSet } from '../types/rocket';

export type FinComponent = TrapezoidFinSet | EllipticalFinSet | FreeformFinSet;

export interface FinFlutterInput {
    fin: FinComponent;
    material: Material;
    maxVelocity: number;
    maxVelocityAltitude: number;
    tipToTip?: boolean;
}

export interface FinFlutterResult {
    flutterVelocity: number;
    marginVelocity: number | null;
    marginPercent: number | null;
    finArea: number;
    finCentroid: number;
    rootChord: number;
    tipChord: number;
    aspectRatio: number;
    thicknessRatio: number;
    shearModulus: number;
    dynamicPressure: number;
    speedOfSound: number;
    warning: string | null;
}

export function getFlutteringFinIds(
    rocket: Rocket,
    simulationResults: SimulationResult[],
    tipToTip = false,
): Set<string> {
    const latest = simulationResults[simulationResults.length - 1];
    if (!latest || latest.maxVelocity <= 0) return new Set();
    const maxVelocityPoint = latest.data.length > 0
        ? latest.data.reduce((best, point) =>
            Math.abs(point.velocity) > Math.abs(best.velocity) ? point : best,
            latest.data[0])
        : undefined;
    const ids = new Set<string>();
    const visit = (component: Rocket['stages'][number]['components'][number]) => {
        if (component.type === 'trapezoidfinset' || component.type === 'ellipticalfinset' || component.type === 'freeformfinset') {
            const result = calculateFinFlutter({
                fin: component,
                material: component.material,
                maxVelocity: latest.maxVelocity,
                maxVelocityAltitude: maxVelocityPoint?.altitude ?? 0,
                tipToTip,
            });
            if (Number.isFinite(result.flutterVelocity) && latest.maxVelocity >= result.flutterVelocity) ids.add(component.id);
        }
        if ('children' in component) component.children?.forEach(visit);
    };
    rocket.stages.forEach(stage => stage.components.forEach(visit));
    return ids;
}

function polygonProperties(points: [number, number][]): { area: number; centroidX: number } {
    let twiceArea = 0;
    let centroidNumerator = 0;
    for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        const cross = x0 * y1 - x1 * y0;
        twiceArea += cross;
        centroidNumerator += (x0 + x1) * cross;
    }
    const area = Math.abs(twiceArea) / 2;
    return {
        area,
        centroidX: Math.abs(twiceArea) > 1e-12 ? centroidNumerator / (3 * twiceArea) : 0,
    };
}

function finGeometry(fin: FinComponent): {
    area: number;
    centroidX: number;
    rootChord: number;
    tipChord: number;
    height: number;
    thickness: number;
} {
    if (fin.type === 'freeformfinset') {
        const properties = polygonProperties(fin.points);
        const rootChord = Math.max(...fin.points.map(point => point[0]), 1e-6);
        const height = Math.max(...fin.points.map(point => point[1]), 1e-6);
        return { ...properties, rootChord, tipChord: 0, height, thickness: fin.thickness };
    }
    if (fin.type === 'ellipticalfinset') {
        return {
            area: Math.PI * fin.rootChord * fin.height / 4,
            centroidX: fin.rootChord / 2,
            rootChord: fin.rootChord,
            tipChord: 0,
            height: fin.height,
            thickness: fin.thickness,
        };
    }
    return {
        area: (fin.rootChord + fin.tipChord) * fin.height / 2,
        centroidX: (fin.rootChord ** 2 + fin.rootChord * fin.tipChord + fin.tipChord ** 2
            + fin.sweepLength * (fin.rootChord + 2 * fin.tipChord)) /
            (3 * (fin.rootChord + fin.tipChord)),
        rootChord: fin.rootChord,
        tipChord: fin.tipChord,
        height: fin.height,
        thickness: fin.thickness,
    };
}

function getShearModulus(material: Material): number {
    if (material.shearModulus && material.shearModulus > 0) return material.shearModulus;
    if (material.elasticModulus && material.elasticModulus > 0) {
        return material.elasticModulus / (2 * (1 + (material.poissonRatio ?? 0.3)));
    }
    return 0.5e9;
}

export function calculateFinFlutter(input: FinFlutterInput): FinFlutterResult {
    const geometry = finGeometry(input.fin);
    const atmosphere = getAtmosphere(Math.max(0, input.maxVelocityAltitude));
    const rootChord = Math.max(geometry.rootChord, 1e-6);
    const aspectRatio = Math.max((geometry.height ** 2) / Math.max(geometry.area, 1e-12), 1e-6);
    const thicknessRatio = Math.max(geometry.thickness / rootChord, 1e-6);
    const taperChord = input.fin.type === 'ellipticalfinset'
        ? rootChord
        : input.fin.type === 'freeformfinset'
            ? Math.max(0, 2 * geometry.area / geometry.height - rootChord)
            : geometry.tipChord;
    const lambda = taperChord / rootChord;
    const finEpsilon = geometry.centroidX / rootChord - 0.25;
    const shearModulus = getShearModulus(input.material) * (input.tipToTip ? 2 : 1);
    const pressureRatio = atmosphere.pressure / 101325;
    const denominator = (24 * finEpsilon * 1.4 * 101325 / Math.PI)
        * (aspectRatio ** 3) / (thicknessRatio ** 3 * (aspectRatio + 2));
    const taperTerm = (lambda + 1) / 2;
    const flutterVelocity = finEpsilon <= 0 || denominator <= 0
        ? Number.POSITIVE_INFINITY
        : atmosphere.speedOfSound * Math.sqrt(shearModulus / (denominator * taperTerm * pressureRatio));
    const marginVelocity = Number.isFinite(flutterVelocity) ? flutterVelocity - input.maxVelocity : null;
    const marginPercent = marginVelocity === null || input.maxVelocity <= 0
        ? null
        : (marginVelocity / input.maxVelocity) * 100;

    return {
        flutterVelocity,
        marginVelocity,
        marginPercent,
        finArea: geometry.area,
        finCentroid: geometry.centroidX,
        rootChord,
        tipChord: taperChord,
        aspectRatio,
        thicknessRatio,
        shearModulus,
        dynamicPressure: atmosphere.pressure,
        speedOfSound: atmosphere.speedOfSound,
        warning: finEpsilon <= 0
            ? 'The fin centroid is too far forward for the Bennett flutter model.'
            : !Number.isFinite(flutterVelocity)
                ? 'Flutter velocity could not be calculated from the supplied geometry.'
                : null,
    };
}
