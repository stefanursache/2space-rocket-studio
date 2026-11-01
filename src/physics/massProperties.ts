import { Motor, Rocket } from '../types/rocket';
import { calculateMassAndCG, getRocketLength } from './aerodynamics';
import { motorInertiaAtTime, motorStateAtTime } from './motorDynamics';

export interface MassProperties {
    mass: number;
    cg: number;
    longitudinalInertia: number;
    transverseInertia: number;
}

export function calculateMassProperties(
    rocket: Rocket,
    motor: Motor | null,
    motorPosition: number,
    time: number,
): MassProperties {
    const base = calculateMassAndCG(rocket);
    const motorState = motor ? motorStateAtTime(motor, time) : null;
    const mass = base.totalMass + (motorState?.totalMass ?? 0);
    const motorCg = motorState ? motorPosition + motorState.cgFromFront : 0;
    const cg = mass > 0
        ? (base.totalMass * base.cg + (motorState?.totalMass ?? 0) * motorCg) / mass
        : 0;
    const length = getRocketLength(rocket);
    const transverse = mass * length ** 2 / 12;
    const longitudinal = motor ? motorInertiaAtTime(motor, time).longitudinal : 0;
    return {
        mass,
        cg,
        longitudinalInertia: longitudinal + mass * Math.max(getRocketLength(rocket) * 0.02, 0.001) ** 2 / 2,
        transverseInertia: transverse,
    };
}
