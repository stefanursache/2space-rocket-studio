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
const EARTH_RADIUS = 6356766; // OpenRocket ISA reference radius, m
const ISA_LAYERS = [0, 11000, 20000, 32000, 47000, 51000, 71000, 84852];
const ISA_TEMPERATURES = [288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.946];

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
    // OpenRocket evaluates ISA against geopotential altitude and supports all
    // standard layers through 84.852 km, not only the troposphere.
    const geometricAltitude = Math.max(0, altitude);
    const h = Math.min(
        geometricAltitude * EARTH_RADIUS / (EARTH_RADIUS + geometricAltitude),
        ISA_LAYERS[ISA_LAYERS.length - 1],
    );
    const temperatures = [...ISA_TEMPERATURES];
    temperatures[0] = baseTemperature;
    const pressures = new Array<number>(ISA_LAYERS.length);
    pressures[0] = basePressure;
    for (let i = 0; i < ISA_LAYERS.length - 1; i++) {
        const layerHeight = ISA_LAYERS[i + 1] - ISA_LAYERS[i];
        const lapseRate = (temperatures[i + 1] - temperatures[i]) / layerHeight;
        pressures[i + 1] = pressureAtLayer(
            pressures[i], temperatures[i], lapseRate, layerHeight,
        );
    }

    let layer = ISA_LAYERS.length - 2;
    for (let i = 0; i < ISA_LAYERS.length - 1; i++) {
        if (h < ISA_LAYERS[i + 1]) {
            layer = i;
            break;
        }
    }
    const lapseRate = (temperatures[layer + 1] - temperatures[layer]) /
        (ISA_LAYERS[layer + 1] - ISA_LAYERS[layer]);
    const dh = h - ISA_LAYERS[layer];
    const temperature = temperatures[layer] + lapseRate * dh;
    const pressure = pressureAtLayer(pressures[layer], temperatures[layer], lapseRate, dh);

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

function pressureAtLayer(
    pressure: number,
    temperature: number,
    lapseRate: number,
    altitudeDelta: number,
): number {
    if (Math.abs(lapseRate) < 1e-10) {
        return pressure * Math.exp(-G0 * altitudeDelta / (R_AIR * temperature));
    }
    // The negative exponent is essential for the ISA warming layers.
    return pressure * Math.pow(
        (temperature + lapseRate * altitudeDelta) / temperature,
        -G0 / (R_AIR * lapseRate),
    );
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
    return getGravityAtLatitude(altitude, 0);
}

/**
 * WGS84 normal gravity approximation used by OpenRocket.
 * Latitude is geodetic latitude in degrees.
 */
export function getGravityAtLatitude(altitude: number, latitudeDeg: number): number {
    const sin2 = Math.sin(latitudeDeg * Math.PI / 180) ** 2;
    const seaLevelGravity = 9.7803267714 *
        (1 + 0.00193185138639 * sin2) /
        Math.sqrt(1 - 0.00669437999013 * sin2);
    const earthRadius = 6371000;
    return seaLevelGravity * (earthRadius / (earthRadius + Math.max(altitude, -earthRadius + 1))) ** 2;
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
    directionDeg: number = 0,
    time: number = 0,
    seed: number = 0
): { x: number; z: number } {
    if (avgSpeed === 0 && stdDev === 0) return { x: 0, z: 0 };

    // OpenRocket's PinkNoiseWindModel is time-based and independent of altitude.
    const sampleTime = Math.max(0, time);
    const t0 = Math.floor(sampleTime / 0.05) * 0.05;
    const fraction = (sampleTime - t0) / 0.05;
    const noise0 = exactPinkNoiseSample(t0, seed);
    const noise1 = exactPinkNoiseSample(t0 + 0.05, seed);
    const noise = noise0 + (noise1 - noise0) * fraction;
    const speed = avgSpeed + noise * stdDev / 2.252;

    // Direction: convert "wind from" compass bearing to velocity components
    // Wind FROM north (0°) blows toward south → negative z
    // Wind FROM east (90°) blows toward west → negative x
    const dirRad = directionDeg * Math.PI / 180;
    const windX = -speed * Math.sin(dirRad);
    const windZ = -speed * Math.cos(dirRad);

    return {
        x: windX,
        z: windZ,
    };
}

const pinkNoiseStreams = new Map<number, JavaPinkNoise>();

function exactPinkNoiseSample(time: number, seed: number): number {
    const index = Math.floor(time / 0.05);
    let stream = pinkNoiseStreams.get(seed);
    if (!stream || index < stream.sampleIndex) {
        stream = new JavaPinkNoise(seed ^ 0x7343aa03);
        pinkNoiseStreams.set(seed, stream);
    }

    while (stream.sampleIndex < index) {
        stream.nextValue();
    }
    return stream.currentValue;
}

class JavaPinkNoise {
    private readonly random: JavaRandom;
    private readonly multipliers: [number, number];
    private values: [number, number] = [0, 0];
    sampleIndex = -1;
    currentValue = 0;

    constructor(seed: number) {
        this.random = new JavaRandom(seed);
        const alpha = 5 / 3;
        this.multipliers = [
            -alpha / 2,
            (1 - alpha / 2) * (-alpha / 2) / 2,
        ];
        for (let i = 0; i < 10; i++) this.nextValue();
        this.sampleIndex = -1;
    }

    nextValue(): number {
        let value = this.random.nextGaussian();
        value -= this.multipliers[0] * this.values[0];
        value -= this.multipliers[1] * this.values[1];
        this.values = [value, this.values[0]];
        this.currentValue = value;
        this.sampleIndex++;
        return value;
    }
}

class JavaRandom {
    private seed: bigint;
    private gaussian: number | null = null;

    constructor(seed: number) {
        const unsigned = BigInt.asUintN(32, BigInt(seed));
        this.seed = (unsigned ^ 0x5deece66dn) & ((1n << 48n) - 1n);
    }

    private next(bits: bigint): number {
        this.seed = (this.seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
        return Number(this.seed >> (48n - bits));
    }

    private nextDouble(): number {
        const high = this.next(26n);
        const low = this.next(27n);
        return (high * 134217728 + low) / 9007199254740992;
    }

    nextGaussian(): number {
        if (this.gaussian !== null) {
            const value = this.gaussian;
            this.gaussian = null;
            return value;
        }
        let u;
        let v;
        let s;
        do {
            u = 2 * this.nextDouble() - 1;
            v = 2 * this.nextDouble() - 1;
            s = u * u + v * v;
        } while (s >= 1 || s === 0);
        const multiplier = Math.sqrt(-2 * Math.log(s) / s);
        this.gaussian = v * multiplier;
        return u * multiplier;
    }
}

export { G0, T0, P0, RHO0 };
