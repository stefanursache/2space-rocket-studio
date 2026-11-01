const RADIUS_NODES = [0, 0.2, 0.4, 0.6];
const CHART_15_X = [0, .125, .25, .375, .5, .625, .75, .875, 1];
const CHART_15_GUIDE = [0, .23, .43, .61, .75, .86, .94, .985, 1];
const CHART_15_RECT_X = [0, .25, .5, .75, 1];
const CHART_15_RECT = [
    [0, .10, .70, .94, 1],
    [0, .359, .705, .872, 1],
    [0, .336, .690, .858, 1],
    [0, .275, .550, .775, 1],
];
const CHART_16_X = [0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];
const CHART_16 = [
    [0, .48, .68, .80, .88, .93, .96, .98, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, .35, .57, .71, .82, .90, .95, .99, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, .15, .29, .41, .53, .64, .73, .80, .86, .90, .94, .96, .98, .99, 1, 1, 1],
];
const GAUSS_NODES = [-.98940093499, -.94457502307, -.86563120239, -.75540440836, -.6178762444, -.45801677766, -.28160355078, -.09501250984, .09501250984, .28160355078, .45801677766, .6178762444, .75540440836, .86563120239, .94457502307, .98940093499];
const GAUSS_WEIGHTS = [.02715245941, .06225352394, .09515851168, .12462897126, .14959598882, .1691565194, .18260341504, .18945061046, .18945061046, .18260341504, .1691565194, .14959598882, .12462897126, .09515851168, .06225352394, .02715245941];

export interface Naca1307Result {
    finLiftFactor: number;
    bodyLoadFactor: number;
    bodyCp: number;
}

function interpolate(x: number, xs: number[], ys: number[]): number {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) {
        if (x <= xs[i]) {
            const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
            return ys[i - 1] + t * (ys[i] - ys[i - 1]);
        }
    }
    return ys[ys.length - 1];
}

export function calculateNaca1307(
    mach: number,
    bodyRadius: number,
    exposedSpan: number,
    rootChord: number,
    tipChord: number,
    leadingEdgeSweep: number,
    bodyEnd: number,
): Naca1307Result | null {
    if (bodyRadius <= 0 || exposedSpan <= 0 || rootChord <= 0 || bodyEnd < rootChord) return null;
    const tau = Math.min(bodyRadius / (bodyRadius + exposedSpan), .6);
    const finLiftFactor = calculateFinInBodyFactor(tau);
    const aspectRatio = exposedSpan ** 2 / ((rootChord + tipChord) * exposedSpan / 2);
    const slenderFactor = Math.max(0, (1 + tau) ** 2 - finLiftFactor);
    const slenderCp = leadingEdgeSweep / 2;
    const liftingLineCp = calculateLiftingLineCp(exposedSpan, bodyRadius, rootChord, tipChord, leadingEdgeSweep);
    const wingSlope = 2 * Math.PI * aspectRatio / (aspectRatio + 2);
    const subsonic = calculateSubsonic(mach, tau, aspectRatio, slenderFactor, slenderCp, liftingLineCp);
    const supersonic = calculateSupersonic(
        mach, tau, aspectRatio, slenderFactor, slenderCp, rootChord, tipChord,
        exposedSpan, leadingEdgeSweep, bodyRadius, bodyEnd, wingSlope,
    );
    const blend = mach <= .9 ? 0 : mach >= 1.5 ? 1 : (mach - .9) / .6;
    const factor = subsonic.factor * (1 - blend) + supersonic.factor * blend;
    const moment = subsonic.factor * subsonic.cp * (1 - blend) + supersonic.factor * supersonic.cp * blend;
    return { finLiftFactor, bodyLoadFactor: factor, bodyCp: factor > 1e-12 ? moment / factor : slenderCp };
}

interface BodyResult { factor: number; cp: number; }

function calculateSubsonic(
    mach: number, tau: number, aspectRatio: number, slenderFactor: number,
    slenderCp: number, liftingLineCp: number,
): BodyResult {
    const beta = Math.sqrt(Math.max(0, 1 - mach * mach));
    const weight = interpolateChart16(beta * aspectRatio, tau);
    return {
        factor: slenderFactor,
        cp: slenderCp + (liftingLineCp - slenderCp) * weight,
    };
}

function calculateSupersonic(
    mach: number, tau: number, aspectRatio: number, slenderFactor: number,
    slenderCp: number, rootChord: number, tipChord: number, exposedSpan: number,
    leadingEdgeSweep: number, bodyRadius: number, bodyEnd: number, wingSlope: number,
): BodyResult {
    if (!(mach > 1) || !(wingSlope > 1e-12)) return { factor: slenderFactor, cp: slenderCp };
    const beta = Math.sqrt(mach * mach - 1);
    const taper = tipChord / rootChord;
    const criterion = (1 + taper) * aspectRatio * (beta + leadingEdgeSweep / exposedSpan);
    const boundaryBeta = (4 / (1 + taper) - aspectRatio * leadingEdgeSweep / exposedSpan) / aspectRatio;
    if (criterion <= 4) {
        const boundary = integratePlanarPressure(
            Math.max(boundaryBeta, 1e-10), rootChord, tipChord, exposedSpan,
            leadingEdgeSweep, bodyRadius, bodyEnd, wingSlope,
        );
        if (!boundary) return { factor: slenderFactor, cp: slenderCp };
        const normalized = Math.min(1, Math.max(0, beta / Math.max(boundaryBeta, 1e-10)));
        const chartWeight = interpolateChart15(normalized, tau, taper, leadingEdgeSweep, rootChord, tipChord);
        return { factor: slenderFactor, cp: slenderCp + (boundary.cp - slenderCp) * chartWeight };
    }
    const planar = integratePlanarPressure(
        beta, rootChord, tipChord, exposedSpan, leadingEdgeSweep, bodyRadius, bodyEnd, wingSlope,
    );
    if (!planar) return { factor: slenderFactor, cp: slenderCp };
    const fraction = Math.min(1, Math.max(0, (criterion - 4) / .25));
    const low = calculateSupersonic(
        Math.sqrt(1 + Math.max(boundaryBeta, 0) ** 2), tau, aspectRatio,
        slenderFactor, slenderCp, rootChord, tipChord, exposedSpan,
        leadingEdgeSweep, bodyRadius, bodyEnd, wingSlope,
    );
    if (criterion < 4.25) {
        const factor = low.factor * (1 - fraction) + planar.factor * fraction;
        const moment = low.factor * low.cp * (1 - fraction) + planar.factor * planar.cp * fraction;
        return { factor, cp: factor > 1e-12 ? moment / factor : planar.cp };
    }
    return planar;
}

function integratePlanarPressure(
    beta: number, rootChord: number, tipChord: number, exposedSpan: number,
    sweep: number, bodyRadius: number, bodyEnd: number, wingSlope: number,
): BodyResult | null {
    const etaEnd = Math.min(2 * bodyRadius, bodyEnd / beta);
    if (!(etaEnd > 1e-12)) return null;
    const m = sweep <= 1e-6 ? Infinity : exposedSpan / sweep;
    const betaM = beta * m;
    let lift = 0;
    let moment = 0;
    const etaScale = etaEnd / 2;
    for (let i = 0; i < GAUSS_NODES.length; i++) {
        const eta = etaScale * (GAUSS_NODES[i] + 1);
        const lower = beta * eta;
        const upper = Math.min(rootChord + lower, bodyEnd);
        if (upper <= lower) continue;
        const xiScale = (upper - lower) / 2;
        const xiCenter = (upper + lower) / 2;
        let stripLift = 0;
        let stripMoment = 0;
        for (let j = 0; j < GAUSS_NODES.length; j++) {
            const xi = xiCenter + xiScale * GAUSS_NODES[j];
            const pressure = planarPressureKernel(beta, m, betaM, eta, xi);
            stripLift += GAUSS_WEIGHTS[j] * pressure;
            stripMoment += GAUSS_WEIGHTS[j] * xi * pressure;
        }
        lift += GAUSS_WEIGHTS[i] * xiScale * stripLift;
        moment += GAUSS_WEIGHTS[i] * xiScale * stripMoment;
    }
    lift *= etaScale;
    moment *= etaScale;
    if (!(lift > 1e-12)) return null;
    const edgeFactor = betaM > 1 ? betaM / Math.sqrt(betaM * betaM - 1) : 1;
    const area = exposedSpan * (rootChord + tipChord);
    const factor = betaM > 1
        ? 8 * edgeFactor * lift / (Math.PI * beta * area * wingSlope)
        : 16 * Math.pow(Math.max(betaM, 1e-12), 1.5) * lift /
          (Math.PI * beta * (betaM + 1) * area * wingSlope);
    return { factor, cp: moment / lift };
}

function planarPressureKernel(beta: number, m: number, betaM: number, eta: number, xi: number): number {
    if (!Number.isFinite(betaM)) return Math.acos(clamp(beta * eta / xi));
    if (betaM > 1) return Math.acos(clamp((xi / beta + betaM * eta) / (eta + m * xi)));
    return Math.sqrt(Math.max(0, (xi / beta - eta) / (eta + m * xi)));
}

function clamp(value: number): number {
    return Math.max(-1, Math.min(1, value));
}

function calculateLiftingLineCp(
    exposedSpan: number, bodyRadius: number, rootChord: number,
    tipChord: number, sweep: number,
): number {
    let weighted = 0;
    let total = 0;
    const scale = exposedSpan / 2;
    for (let i = 0; i < GAUSS_NODES.length; i++) {
        const offset = scale * (GAUSS_NODES[i] + 1);
        const eta = bodyRadius + offset;
        const circulation = Math.sqrt(Math.max(0, 1 - (offset / exposedSpan) ** 2));
        const weight = GAUSS_WEIGHTS[i] * circulation / (eta * eta);
        total += weight;
        weighted += weight * offset;
    }
    const quarterSweep = sweep + tipChord / 4 - rootChord / 4;
    return total > 1e-12 ? rootChord / 4 + (weighted / total) * quarterSweep / exposedSpan : rootChord / 4;
}

function interpolateChart15(
    criterion: number, tau: number, taper: number, sweep: number, rootChord: number, tipChord: number,
): number {
    const sweepFraction = rootChord === tipChord ? 0 : Math.max(0, Math.min(1, sweep / (rootChord - tipChord)));
    const families = [0, 1, 2].map(sweepFamily => {
        const taperValues = [0, .5, 1].map(taperFamily => {
            const radiusValues = [0, .2, .4, .6].map(radius => {
                if (sweepFamily === 0 && taperFamily === 2) {
                    return interpolate(criterion, CHART_15_RECT_X, CHART_15_RECT[Math.round(radius / .2)]);
                }
                const scale = [1, .98, .94, .9][Math.round(radius / .2)];
                return interpolate(Math.min(1, criterion * scale), CHART_15_X, CHART_15_GUIDE);
            });
            return interpolateRadius(radiusValues, tau);
        });
        return taper <= .5 ? taperValues[0] + (taperValues[1] - taperValues[0]) * taper * 2
            : taperValues[1] + (taperValues[2] - taperValues[1]) * (taper * 2 - 1);
    });
    return sweepFraction <= .5 ? families[0] + (families[1] - families[0]) * sweepFraction * 2
        : families[1] + (families[2] - families[1]) * (sweepFraction * 2 - 1);
}

function interpolateChart16(criterion: number, tau: number): number {
    const curve = CHART_16[0];
    const values = [0, .2, .4, .6].map((radius, index) =>
        interpolate(criterion * [1, 1.05, 1.1, 1.15][index], CHART_16_X, curve));
    return interpolateRadius(values, tau);
}

function interpolateRadius(values: number[], tau: number): number {
    const radius = Math.max(0, Math.min(.6, tau));
    if (radius <= .2) return values[0] + (values[1] - values[0]) * radius / .2;
    if (radius <= .4) return values[1] + (values[2] - values[1]) * (radius - .2) / .2;
    return values[2] + (values[3] - values[2]) * (radius - .4) / .2;
}

export function calculateFinInBodyFactor(tau: number): number {
    if (tau <= 1e-6) return 1;
    if (tau >= 1) return 2;
    const inverse = 1 / tau;
    const angle = .5 * Math.atan(.5 * (inverse - tau)) + Math.PI / 4;
    return (2 / Math.PI) * ((1 + tau ** 4) * angle - tau ** 2 * (inverse - tau + 2 * Math.atan(tau))) / (1 - tau) ** 2;
}

function calculateBodyCp(bodyEnd: number, rootChord: number, tipChord: number, sweep: number, beta: number): number {
    if (beta < 1e-10) return rootChord * .5 + sweep * .25;
    let lift = 0;
    let moment = 0;
    for (let i = 0; i < GAUSS_NODES.length; i++) {
        const x = (GAUSS_NODES[i] + 1) / 2;
        const chord = rootChord + (tipChord - rootChord) * x;
        const pressure = Math.sqrt(Math.max(0, 1 - (beta * x / Math.max(bodyEnd, rootChord)) ** 2));
        lift += GAUSS_WEIGHTS[i] * pressure;
        moment += GAUSS_WEIGHTS[i] * pressure * (sweep * x + chord * .5);
    }
    return lift > 1e-12 ? moment / lift : rootChord * .5;
}

function nearestRadiusIndex(tau: number): number {
    let index = 0;
    let distance = Infinity;
    RADIUS_NODES.forEach((value, i) => {
        if (Math.abs(tau - value) < distance) { distance = Math.abs(tau - value); index = i; }
    });
    return index;
}
