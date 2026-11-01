import { NoseCone } from '../types/rocket';

type Point = [number, number, number];

function radiusAt(nose: NoseCone, z: number, inner: boolean): number {
    const length = Math.max(nose.length, 1e-6);
    const t = Math.max(0, Math.min(1, z / length));
    let radius: number;
    switch (nose.shape) {
        case 'conical':
            radius = nose.baseRadius * t;
            break;
        case 'ellipsoid':
            radius = nose.baseRadius * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2));
            break;
        case 'power':
            radius = nose.baseRadius * t ** Math.max(nose.shapeParameter, 0.01);
            break;
        case 'parabolic':
            radius = nose.baseRadius * (2 * t - t * t);
            break;
        case 'haack':
            radius = nose.baseRadius * Math.sqrt(Math.max(0, (2 * t - t * t) * 0.9));
            break;
        case 'ogive':
        default: {
            const rho = Math.max((nose.baseRadius ** 2 + nose.length ** 2) / (2 * nose.baseRadius), nose.length);
            radius = Math.sqrt(Math.max(0, rho ** 2 - (nose.length - z) ** 2)) + nose.baseRadius - rho;
            break;
        }
    }
    if (!inner) return Math.max(0, radius);
    return Math.max(0, radius - nose.thickness);
}

function addFace(faces: Point[][], points: Point[]): void {
    if (points.length < 3) return;
    const [a, b, c] = points;
    const ab: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: Point = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross: Point = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const areaSquared = cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2;
    if (areaSquared > 1e-24) faces.push(points);
}

function ringPoint(radius: number, z: number, index: number, segments: number): Point {
    const angle = (index / segments) * Math.PI * 2;
    return [radius * Math.cos(angle), radius * Math.sin(angle), z];
}

function stepText(value: string): string {
    return value.replace(/'/g, "''").replace(/[\r\n]+/g, ' ');
}

export function noseConeToStep(nose: NoseCone, segments = 64): string {
    const safeSegments = Math.max(16, Math.min(128, Math.round(segments)));
    const faces: Point[][] = [];
    const outerRings = 24;
    const innerStart = Math.min(nose.length * 0.12, Math.max(nose.thickness * 2, 0.001));

    for (let ring = 0; ring < outerRings; ring++) {
        const z0 = nose.length * ring / outerRings;
        const z1 = nose.length * (ring + 1) / outerRings;
        for (let i = 0; i < safeSegments; i++) {
            const next = (i + 1) % safeSegments;
            addFace(faces, [
                ringPoint(radiusAt(nose, z0, false), z0, i, safeSegments),
                ringPoint(radiusAt(nose, z1, false), z1, i, safeSegments),
                ringPoint(radiusAt(nose, z1, false), z1, next, safeSegments),
            ]);
            addFace(faces, [
                ringPoint(radiusAt(nose, z0, false), z0, i, safeSegments),
                ringPoint(radiusAt(nose, z1, false), z1, next, safeSegments),
                ringPoint(radiusAt(nose, z0, false), z0, next, safeSegments),
            ]);
        }
    }

    for (let ring = 0; ring < outerRings - 1; ring++) {
        const z0 = innerStart + (nose.length - innerStart) * ring / (outerRings - 1);
        const z1 = innerStart + (nose.length - innerStart) * (ring + 1) / (outerRings - 1);
        for (let i = 0; i < safeSegments; i++) {
            const next = (i + 1) % safeSegments;
            addFace(faces, [
                ringPoint(radiusAt(nose, z1, true), z1, i, safeSegments),
                ringPoint(radiusAt(nose, z0, true), z0, i, safeSegments),
                ringPoint(radiusAt(nose, z1, true), z1, next, safeSegments),
            ]);
            addFace(faces, [
                ringPoint(radiusAt(nose, z1, true), z1, next, safeSegments),
                ringPoint(radiusAt(nose, z0, true), z0, i, safeSegments),
                ringPoint(radiusAt(nose, z0, true), z0, next, safeSegments),
            ]);
        }
    }
    const innerTipRadius = radiusAt(nose, innerStart, true);
    const innerTip: Point = [0, 0, innerStart];
    for (let i = 0; i < safeSegments; i++) {
        addFace(faces, [
            innerTip,
            ringPoint(innerTipRadius, innerStart, (i + 1) % safeSegments, safeSegments),
            ringPoint(innerTipRadius, innerStart, i, safeSegments),
        ]);
    }

    const shoulderEnd = nose.length + Math.max(0, nose.shoulderLength);
    const innerShoulderRadius = Math.max(0, nose.shoulderRadius - nose.shoulderThickness);
    for (let i = 0; i < safeSegments; i++) {
        const next = (i + 1) % safeSegments;
        addFace(faces, [
            ringPoint(nose.baseRadius, nose.length, i, safeSegments),
            ringPoint(nose.shoulderRadius, shoulderEnd, i, safeSegments),
            ringPoint(nose.shoulderRadius, shoulderEnd, next, safeSegments),
        ]);
        addFace(faces, [
            ringPoint(nose.baseRadius, nose.length, i, safeSegments),
            ringPoint(nose.shoulderRadius, shoulderEnd, next, safeSegments),
            ringPoint(nose.baseRadius, nose.length, next, safeSegments),
        ]);
        addFace(faces, [
            ringPoint(innerShoulderRadius, shoulderEnd, i, safeSegments),
            ringPoint(radiusAt(nose, nose.length, true), nose.length, i, safeSegments),
            ringPoint(innerShoulderRadius, shoulderEnd, next, safeSegments),
        ]);
        addFace(faces, [
            ringPoint(innerShoulderRadius, shoulderEnd, next, safeSegments),
            ringPoint(radiusAt(nose, nose.length, true), nose.length, i, safeSegments),
            ringPoint(radiusAt(nose, nose.length, true), nose.length, next, safeSegments),
        ]);
        addFace(faces, [
            ringPoint(nose.shoulderRadius, shoulderEnd, i, safeSegments),
            ringPoint(innerShoulderRadius, shoulderEnd, next, safeSegments),
            ringPoint(nose.shoulderRadius, shoulderEnd, next, safeSegments),
        ]);
    }

    const entities: string[] = [];
    let id = 1;
    const pointIds = new Map<string, number>();
    const getPointId = (point: Point): number => {
        const key = point.map(value => value.toFixed(9)).join(',');
        const existing = pointIds.get(key);
        if (existing !== undefined) return existing;
        const pointId = id++;
        pointIds.set(key, pointId);
        entities.push(`#${pointId}=CARTESIAN_POINT('',(${key}));`);
        return pointId;
    };
    const faceIds: number[] = [];
    for (const face of faces) {
        const facePointIds = face.map(getPointId);
        const loopId = id++;
        entities.push(`#${loopId}=POLY_LOOP('',(${facePointIds.map(pointId => `#${pointId}`).join(',')}));`);
        const boundId = id++;
        entities.push(`#${boundId}=FACE_OUTER_BOUND('',#${loopId},.T.);`);
        const faceId = id++;
        entities.push(`#${faceId}=FACE('',(#${boundId}));`);
        faceIds.push(faceId);
    }
    const shellId = id++;
    entities.push(`#${shellId}=CLOSED_SHELL('',(${faceIds.map(faceId => `#${faceId}`).join(',')}));`);
    const brepId = id++;
    const name = stepText(nose.name || 'Nose cone');
    entities.push(`#${brepId}=FACETED_BREP('${name}',#${shellId});`);

    // A standalone FACETED_BREP is valid geometry, but many STEP readers only
    // display shapes linked through the standard product representation tree.
    const applicationContextId = id++;
    const protocolId = id++;
    const productContextId = id++;
    const productId = id++;
    const formationId = id++;
    const definitionContextId = id++;
    const productDefinitionId = id++;
    const productShapeId = id++;
    const lengthUnitId = id++;
    const planeAngleUnitId = id++;
    const solidAngleUnitId = id++;
    const uncertaintyId = id++;
    const representationContextId = id++;
    const shapeRepresentationId = id++;
    const shapeDefinitionId = id++;

    entities.push(`#${applicationContextId}=APPLICATION_CONTEXT('core data for automotive mechanical design processes');`);
    entities.push(`#${protocolId}=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${applicationContextId});`);
    entities.push(`#${productContextId}=PRODUCT_CONTEXT('',#${applicationContextId},'mechanical');`);
    entities.push(`#${productId}=PRODUCT('${name}','${name}','',(#${productContextId}));`);
    entities.push(`#${formationId}=PRODUCT_DEFINITION_FORMATION('','',#${productId});`);
    entities.push(`#${definitionContextId}=PRODUCT_DEFINITION_CONTEXT('part definition',#${applicationContextId},'design');`);
    entities.push(`#${productDefinitionId}=PRODUCT_DEFINITION('','',#${formationId},#${definitionContextId});`);
    entities.push(`#${productShapeId}=PRODUCT_DEFINITION_SHAPE('','',#${productDefinitionId});`);
    entities.push(`#${lengthUnitId}= ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );`);
    entities.push(`#${planeAngleUnitId}= ( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) );`);
    entities.push(`#${solidAngleUnitId}= ( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() );`);
    entities.push(`#${uncertaintyId}=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-6),#${lengthUnitId},'distance_accuracy_value','confusion accuracy');`);
    entities.push(`#${representationContextId}=( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertaintyId})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lengthUnitId},#${planeAngleUnitId},#${solidAngleUnitId})) REPRESENTATION_CONTEXT('','3D') );`);
    entities.push(`#${shapeRepresentationId}=SHAPE_REPRESENTATION('',(#${brepId}),#${representationContextId});`);
    entities.push(`#${shapeDefinitionId}=SHAPE_DEFINITION_REPRESENTATION(#${productShapeId},#${shapeRepresentationId});`);

    return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('2Space Rocket Studio STEP export'),'2;1');
FILE_NAME('${name}.step','${new Date().toISOString()}',('2Space Rocket Studio'),('2Space Rocket Studio'),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN_CC2'));
ENDSEC;
DATA;
${entities.join('\n')}
ENDSEC;
END-ISO-10303-21;
`;
}

export function downloadNoseConeStep(nose: NoseCone): void {
    const blob = new Blob([noseConeToStep(nose)], { type: 'application/step' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${nose.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.step`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
