import { getAtmosphere, getDynamicPressure } from './atmosphere';

export interface RecoveryDeviceState {
    area: number;
    cd: number;
    deployed: boolean;
    inflation: number;
}

export interface LandingState {
    altitude: number;
    verticalVelocity: number;
}

export function recoveryCdA(devices: RecoveryDeviceState[]): number {
    return devices.reduce((sum, device) =>
        sum + (device.deployed ? device.area * device.cd * Math.max(0, Math.min(1, device.inflation)) : 0), 0);
}

export function landingStep(
    state: LandingState,
    mass: number,
    altitude: number,
    dt: number,
    recoveryDevices: RecoveryDeviceState[],
): LandingState & { acceleration: number; groundTimeFraction: number | null } {
    const atmosphere = getAtmosphere(altitude);
    const cdA = recoveryCdA(recoveryDevices);
    const drag = getDynamicPressure(state.verticalVelocity, atmosphere.density) * cdA;
    const acceleration = -9.80665 + Math.sign(state.verticalVelocity || -1) * drag / Math.max(mass, 1e-9);
    const nextVelocity = state.verticalVelocity + acceleration * dt;
    const nextAltitude = state.altitude + state.verticalVelocity * dt + .5 * acceleration * dt ** 2;
    const groundTimeFraction = nextAltitude < 0 && state.altitude >= 0
        ? state.altitude / Math.max(state.altitude - nextAltitude, 1e-9)
        : null;
    return { altitude: nextAltitude, verticalVelocity: nextVelocity, acceleration, groundTimeFraction };
}
