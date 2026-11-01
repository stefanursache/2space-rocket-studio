export interface Quaternion {
    w: number;
    x: number;
    y: number;
    z: number;
}

export interface AngularRate {
    x: number;
    y: number;
    z: number;
}

export const IDENTITY_QUATERNION: Quaternion = { w: 1, x: 0, y: 0, z: 0 };

export function normalizeQuaternion(q: Quaternion): Quaternion {
    const length = Math.hypot(q.w, q.x, q.y, q.z);
    if (length < 1e-12) return IDENTITY_QUATERNION;
    return { w: q.w / length, x: q.x / length, y: q.y / length, z: q.z / length };
}

export function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
    return {
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    };
}

export function integrateQuaternion(
    orientation: Quaternion,
    angularRate: AngularRate,
    dt: number,
): Quaternion {
    const omega: Quaternion = { w: 0, x: angularRate.x, y: angularRate.y, z: angularRate.z };
    const derivative = multiplyQuaternion(omega, orientation);
    return normalizeQuaternion({
        w: orientation.w + derivative.w * dt / 2,
        x: orientation.x + derivative.x * dt / 2,
        y: orientation.y + derivative.y * dt / 2,
        z: orientation.z + derivative.z * dt / 2,
    });
}

export function quaternionForward(q: Quaternion): [number, number, number] {
    return [
        2 * (q.x * q.z + q.w * q.y),
        1 - 2 * (q.x * q.x + q.y * q.y),
        2 * (q.y * q.z - q.w * q.x),
    ];
}

export function angularAcceleration(
    angularRate: AngularRate,
    desiredDirection: [number, number, number],
    currentDirection: [number, number, number],
    dynamicPressure: number,
    inertia: number,
): AngularRate {
    const torqueScale = Math.min(dynamicPressure / 1500, 3) * Math.max(inertia, 1e-6);
    const cross: AngularRate = {
        x: currentDirection[1] * desiredDirection[2] - currentDirection[2] * desiredDirection[1],
        y: currentDirection[2] * desiredDirection[0] - currentDirection[0] * desiredDirection[2],
        z: currentDirection[0] * desiredDirection[1] - currentDirection[1] * desiredDirection[0],
    };
    return {
        x: cross.x * torqueScale - angularRate.x * 0.8,
        y: cross.y * torqueScale - angularRate.y * 0.8,
        z: cross.z * torqueScale - angularRate.z * 0.8,
    };
}

export function chooseAdaptiveTimeStep(
    configured: number,
    previous: number,
    onLaunchRod: boolean,
    launchRodLength: number,
    speed: number,
    angularRate: AngularRate,
    angularAccelerationValue: AngularRate,
): number {
    const limits = [
        configured,
        previous > 0 ? previous * 1.5 : configured,
        onLaunchRod ? configured / 5 : configured,
        onLaunchRod && speed > 1 ? launchRodLength / speed / 10 : configured,
        Math.abs(angularRate.x) > 1e-8 ? 0.0523598776 / Math.abs(angularRate.x) : configured,
        Math.abs(angularRate.y) > 1e-8 ? 0.0698131701 / Math.abs(angularRate.y) : configured,
        Math.abs(angularRate.z) > 1e-8 ? 0.0698131701 / Math.abs(angularRate.z) : configured,
        Math.abs(angularAccelerationValue.x) > 1e-8 ? 0.034906585 / Math.abs(angularAccelerationValue.x) : configured,
        Math.abs(angularAccelerationValue.y) > 1e-8 ? 0.0698131701 / Math.abs(angularAccelerationValue.y) : configured,
        Math.abs(angularAccelerationValue.z) > 1e-8 ? 0.0698131701 / Math.abs(angularAccelerationValue.z) : configured,
    ];
    return Math.max(configured / 20, Math.min(...limits));
}
