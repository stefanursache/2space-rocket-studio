// ===========================
// Atmospheric Model (ISA)
// ===========================

// International Standard Atmosphere constants
const R_AIR = 287.053; // specific gas constant for dry air, J/(kg·K)
const GAMMA = 1.4; // ratio of specific heats
const G0 = 9.80665; // standard gravity, m/s²
const T0 = 288.15; // sea level standard temperature, K
const P0 = 101325; // sea level standard pressure, Pa
const RHO0 = 1.225; // sea level standard density, kg/m³
const LAPSE_RATE = 0.0065; // temperature lapse rate, K/m (troposphere)

export interface AtmosphericConditions {
    temperature: number; // K
    pressure: number; // Pa
    density: number; // kg/m³
    speedOfSound: number; // m/s
    dynamicViscosity: number; // Pa·s
    kinematicViscosity: number; // m²/s
}

/**
 * Compute atmospheric conditions using the International Standard Atmosphere model
 * @param altitude - altitude above sea level in meters
 * @param baseTemperature - ground-level temperature (optional override)
 * @param basePressure - ground-level pressure (optional override)
 * @returns atmospheric conditions at the given altitude
 */
export function getAtmosphere(
    altitude: number,
    baseTemperature: number = T0,
    basePressure: number = P0
): AtmosphericConditions {
    // Clamp altitude to troposphere range for simplicity
    const h = Math.max(0, Math.min(altitude, 47000));

    let temperature: number;
    let pressure: number;

    if (h <= 11000) {
        // Troposphere
        temperature = baseTemperature - LAPSE_RATE * h;
        pressure = basePressure * Math.pow(temperature / baseTemperature, G0 / (LAPSE_RATE * R_AIR));
    } else if (h <= 20000) {
        // Lower stratosphere (isothermal)
        const T11 = baseTemperature - LAPSE_RATE * 11000;
        const P11 = basePressure * Math.pow(T11 / baseTemperature, G0 / (LAPSE_RATE * R_AIR));
        temperature = T11;
        pressure = P11 * Math.exp(-G0 * (h - 11000) / (R_AIR * T11));
    } else {
        // Upper stratosphere
        const T11 = baseTemperature - LAPSE_RATE * 11000;
        const P11 = basePressure * Math.pow(T11 / baseTemperature, G0 / (LAPSE_RATE * R_AIR));
        const P20 = P11 * Math.exp(-G0 * 9000 / (R_AIR * T11));
        const lapseRate2 = 0.001; // ISA warming rate in upper stratosphere (20-32km): +1 K/km
        temperature = T11 + lapseRate2 * (h - 20000);
        pressure = P20 * Math.pow(temperature / T11, G0 / (lapseRate2 * R_AIR));
    }

    const density = pressure / (R_AIR * temperature);
    const speedOfSound = Math.sqrt(GAMMA * R_AIR * temperature);

    // Sutherland's formula for dynamic viscosity
    const T_ref = 291.15;
    const mu_ref = 1.827e-5;
    const S = 120.0;
    const dynamicViscosity = mu_ref * Math.pow(temperature / T_ref, 1.5) * (T_ref + S) / (temperature + S);

    const kinematicViscosity = dynamicViscosity / density;

    return {
        temperature,
        pressure,
        density,
        speedOfSound,
        dynamicViscosity,
        kinematicViscosity,
    };
}

/**
 * Compute Mach number
 */
export function getMachNumber(velocity: number, speedOfSound: number): number {
    return Math.abs(velocity) / speedOfSound;
}

/**
 * Compute dynamic pressure (q)
 */
export function getDynamicPressure(velocity: number, density: number): number {
    return 0.5 * density * velocity * velocity;
}

/**
 * Compute Reynolds number
 */
export function getReynoldsNumber(
    velocity: number,
    length: number,
    kinematicViscosity: number
): number {
    if (length === 0 || kinematicViscosity === 0) return 0;
    return Math.abs(velocity) * length / kinematicViscosity;
}

/**
 * Gravity at altitude (simple model)
 */
export function getGravity(altitude: number): number {
    const R_EARTH = 6371000; // Earth radius in meters
    return G0 * Math.pow(R_EARTH / (R_EARTH + altitude), 2);
}

/**
 * Wind model — matches OpenRocket approach.
 * Uses power-law profile for mean speed and small deterministic
 * turbulence. Direction is the compass bearing wind blows FROM.
 * Returns wind velocity components (x=east, z=north).
 */
export function getWindSpeed(
    altitude: number,
    avgSpeed: number,
    stdDev: number,
    directionDeg: number = 0
): { x: number; z: number } {
    if (avgSpeed === 0 && stdDev === 0) return { x: 0, z: 0 };

    // Power-law wind profile (OpenRocket uses 1/7 power law)
    const refHeight = 10; // reference measurement height in meters
    const alpha = 1 / 7; // 0.1429 — standard for open terrain
    const h = Math.max(altitude, 0.5); // avoid extreme values near ground
    const speedFactor = Math.pow(h / refHeight, alpha);
    const meanSpeed = avgSpeed * speedFactor;

    // Small deterministic turbulence (capped to ±stdDev)
    // OpenRocket uses Gaussian turbulence; we use smooth sinusoidal approximation
    // Turbulence intensity is typically 10-20% of mean speed
    const turbulenceFraction = stdDev > 0
        ? stdDev * 0.3 * (Math.sin(altitude * 0.17 + 1.7) * 0.5 + Math.sin(altitude * 0.07 + 0.9) * 0.3)
        : 0;

    const speed = meanSpeed + turbulenceFraction;

    // Direction: convert "wind from" compass bearing to velocity components
    // Wind FROM north (0°) blows toward south → negative z
    // Wind FROM east (90°) blows toward west → negative x
    const dirRad = directionDeg * Math.PI / 180;
    const windX = -speed * Math.sin(dirRad);
    const windZ = -speed * Math.cos(dirRad);

    // Small lateral turbulence component (perpendicular to mean direction)
    const crossTurb = stdDev > 0
        ? stdDev * 0.15 * Math.sin(altitude * 0.23 + 3.1)
        : 0;
    const crossX = -crossTurb * Math.cos(dirRad);
    const crossZ = crossTurb * Math.sin(dirRad);

    return {
        x: windX + crossX,
        z: windZ + crossZ,
    };
}

export { G0, T0, P0, RHO0 };
