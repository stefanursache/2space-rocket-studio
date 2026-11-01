import { Motor } from '../types/rocket';

export function motorImpulseToTime(motor: Motor, time: number): number {
    if (time <= 0 || motor.thrustCurve.length < 2) return 0;
    const end = Math.min(time, motor.burnTime);
    let impulse = 0;
    for (let i = 0; i < motor.thrustCurve.length - 1; i++) {
        const [t0, f0] = motor.thrustCurve[i];
        const [t1, f1] = motor.thrustCurve[i + 1];
        if (end <= t0) break;
        const segmentEnd = Math.min(end, t1);
        const width = segmentEnd - t0;
        if (width > 0) {
            const fraction = (segmentEnd - t0) / Math.max(t1 - t0, 1e-12);
            impulse += width * (f0 + (f0 + fraction * (f1 - f0))) / 2;
        }
        if (end <= t1) break;
    }
    return impulse;
}

export function motorStateAtTime(motor: Motor, time: number): {
    propellantMass: number;
    totalMass: number;
    cgFromFront: number;
} {
    const normalized = motor.totalImpulse > 0
        ? Math.min(1, Math.max(0, motorImpulseToTime(motor, time) / motor.totalImpulse))
        : time >= motor.burnTime ? 1 : 0;
    const propellantMass = motor.propellantMass * (1 - normalized);
    const casingMass = Math.max(0, motor.totalMass - motor.propellantMass);
    const motorLength = motor.length / 1000;
    const propellantCg = motorLength * (0.42 + 0.08 * normalized);
    const casingCg = motorLength * 0.5;
    const totalMass = casingMass + propellantMass;
    return {
        propellantMass,
        totalMass,
        cgFromFront: totalMass > 0
            ? (casingMass * casingCg + propellantMass * propellantCg) / totalMass
            : casingCg,
    };
}

export function motorInertiaAtTime(motor: Motor, time: number): {
    longitudinal: number;
    transverse: number;
} {
    const state = motorStateAtTime(motor, time);
    const radius = motor.diameter / 2000;
    const length = motor.length / 1000;
    return {
        longitudinal: 0.5 * state.totalMass * radius ** 2,
        transverse: state.totalMass * (3 * radius ** 2 + length ** 2) / 12,
    };
}
