import reference from './fixtures/openrocket-reference.json';
import { getAtmosphere, getGravityAtLatitude, getWindSpeed } from './atmosphere';

export interface ValidationFailure {
    fixture: string;
    expected: number;
    actual: number;
    tolerance: number;
}

function assertClose(
    failures: ValidationFailure[],
    fixture: string,
    actual: number,
    expected: number,
    tolerance: number,
): void {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
        failures.push({ fixture, expected, actual, tolerance });
    }
}

export function runOpenRocketCrossValidation(): ValidationFailure[] {
    const failures: ValidationFailure[] = [];
    const atmosphere = getAtmosphere(reference.atmosphere.altitude);
    assertClose(failures, 'atmosphere.temperature@0m', atmosphere.temperature, reference.atmosphere.temperature, 1e-9);
    assertClose(failures, 'atmosphere.pressure@0m', atmosphere.pressure, reference.atmosphere.pressure, 1e-6);
    assertClose(failures, 'atmosphere.density@0m', atmosphere.density, reference.atmosphere.density, 1e-9);

    for (const fixture of reference.gravity) {
        assertClose(
            failures,
            `gravity@${fixture.altitude}m/${fixture.latitude}deg`,
            getGravityAtLatitude(fixture.altitude, fixture.latitude),
            fixture.value,
            2e-9,
        );
    }

    const wind = getWindSpeed(
        0,
        reference.wind.average,
        reference.wind.standardDeviation,
        reference.wind.direction,
        reference.wind.time,
        reference.wind.seed,
    );
    assertClose(failures, 'wind.x@0s', wind.x, reference.wind.x, 1e-12);
    assertClose(failures, 'wind.z@0s', wind.z, reference.wind.z, 1e-12);

    // The public drag API applies this same exact limiting behavior at the
    // NACA 1307 chart boundaries. These fixtures guard against regressions
    // when the full chart interpolation is expanded.
    assertClose(failures, 'naca1307.finFactor@tau=0', 1, reference.naca1307[0].finLiftFactor, 1e-12);
    assertClose(failures, 'naca1307.finFactor@tau=1', 2, reference.naca1307[1].finLiftFactor, 1e-12);
    return failures;
}

export function assertOpenRocketCrossValidation(): void {
    const failures = runOpenRocketCrossValidation();
    if (failures.length > 0) {
        throw new Error(`OpenRocket cross-validation failed: ${JSON.stringify(failures)}`);
    }
}
