// ============================================================
// Unit conversion system — metric (SI) ↔ US customary
// All internal values are SI. This module converts for display.
// ============================================================

export type UnitSystem = 'metric' | 'us';

// ── Conversion factors (SI → US) ──────────────────────────

const M_TO_FT = 3.28084;
const M_TO_IN = 39.3701;
const KG_TO_LB = 2.20462;
const KG_TO_OZ = 35.274;
const N_TO_LBF = 0.224809;
const PA_TO_INHG = 0.0002953;
const MPS_TO_FPS = 3.28084;
const M2_TO_IN2 = 1550.0031;
const CM2_TO_IN2 = 0.155;

// ── Unit labels per category ──────────────────────────────

interface UnitDef {
    label: string;
    /** multiply the SI value by this to get the display value */
    factor: number;
    decimals: number;
}

/** Map from internal unit category → definitions per system */
const UNITS: Record<string, Record<UnitSystem, UnitDef>> = {
    // Length — metres → displayed unit
    mm: { metric: { label: 'mm', factor: 1000, decimals: 1 }, us: { label: 'in', factor: M_TO_IN, decimals: 3 } },
    cm: { metric: { label: 'cm', factor: 100, decimals: 1 }, us: { label: 'in', factor: M_TO_IN, decimals: 2 } },
    m: { metric: { label: 'm', factor: 1, decimals: 1 }, us: { label: 'ft', factor: M_TO_FT, decimals: 1 } },
    m_alt: { metric: { label: 'm', factor: 1, decimals: 0 }, us: { label: 'ft', factor: M_TO_FT, decimals: 0 } },
    // Mass — kilograms → displayed unit
    g: { metric: { label: 'g', factor: 1000, decimals: 1 }, us: { label: 'oz', factor: KG_TO_OZ, decimals: 2 } },
    kg: { metric: { label: 'kg', factor: 1, decimals: 3 }, us: { label: 'lb', factor: KG_TO_LB, decimals: 3 } },
    // Velocity — m/s → displayed unit
    'mps': { metric: { label: 'm/s', factor: 1, decimals: 1 }, us: { label: 'ft/s', factor: MPS_TO_FPS, decimals: 1 } },
    // Acceleration — m/s² → displayed unit
    'mps2': { metric: { label: 'm/s²', factor: 1, decimals: 1 }, us: { label: 'ft/s²', factor: MPS_TO_FPS, decimals: 1 } },
    // Force / thrust — Newtons → displayed unit
    N: { metric: { label: 'N', factor: 1, decimals: 1 }, us: { label: 'lbf', factor: N_TO_LBF, decimals: 2 } },
    // Impulse — Ns → displayed unit
    Ns: { metric: { label: 'Ns', factor: 1, decimals: 1 }, us: { label: 'lbf·s', factor: N_TO_LBF, decimals: 2 } },
    // Temperature — stored as K internally, displayed as °C or °F
    temp: { metric: { label: '°C', factor: 1, decimals: 0 }, us: { label: '°F', factor: 1, decimals: 0 } },
    // Pressure — stored as Pa internally
    press: { metric: { label: 'hPa', factor: 0.01, decimals: 0 }, us: { label: 'inHg', factor: PA_TO_INHG, decimals: 2 } },
    // Area — stored as m²
    'cm2': { metric: { label: 'cm²', factor: 1e4, decimals: 3 }, us: { label: 'in²', factor: M2_TO_IN2, decimals: 3 } },
    // Density (various)
    'kg/m3': { metric: { label: 'kg/m³', factor: 1, decimals: 1 }, us: { label: 'lb/ft³', factor: 0.062428, decimals: 2 } },
    'kg/m2': { metric: { label: 'kg/m²', factor: 1, decimals: 3 }, us: { label: 'lb/ft²', factor: 0.204816, decimals: 4 } },
    'kg/m': { metric: { label: 'kg/m', factor: 1, decimals: 4 }, us: { label: 'lb/ft', factor: 0.671969, decimals: 4 } },
    // Motor dimensions — stored in mm already
    'motor_mm': { metric: { label: 'mm', factor: 1, decimals: 0 }, us: { label: 'in', factor: 1 / 25.4, decimals: 2 } },
    // Wind speed
    'wind': { metric: { label: 'm/s', factor: 1, decimals: 1 }, us: { label: 'mph', factor: 2.23694, decimals: 1 } },
    // Specific impulse
    'isp': { metric: { label: 's', factor: 1, decimals: 1 }, us: { label: 's', factor: 1, decimals: 1 } },
    // time — unchanged
    's': { metric: { label: 's', factor: 1, decimals: 2 }, us: { label: 's', factor: 1, decimals: 2 } },
    // degrees — unchanged
    'deg': { metric: { label: '°', factor: 1, decimals: 1 }, us: { label: '°', factor: 1, decimals: 1 } },
    // calibers — unchanged
    'cal': { metric: { label: 'cal', factor: 1, decimals: 2 }, us: { label: 'cal', factor: 1, decimals: 2 } },
};

// ── Public API ─────────────────────────────────────────────

/** Get the display label for a unit category in the given system */
export function unitLabel(category: string, system: UnitSystem): string {
    return UNITS[category]?.[system]?.label ?? category;
}

/** Convert an SI value to display value for the given system + category */
export function toDisplay(siValue: number, category: string, system: UnitSystem): number {
    const def = UNITS[category]?.[system];
    if (!def) return siValue;
    return siValue * def.factor;
}

/** Convert a display value back to SI for the given system + category */
export function toSI(displayValue: number, category: string, system: UnitSystem): number {
    const def = UNITS[category]?.[system];
    if (!def) return displayValue;
    return displayValue / def.factor;
}

/** Format an SI value for display: convert + round to proper decimals */
export function fmt(siValue: number, category: string, system: UnitSystem, overrideDecimals?: number): string {
    const def = UNITS[category]?.[system];
    if (!def) return siValue.toFixed(1);
    const converted = siValue * def.factor;
    return converted.toFixed(overrideDecimals ?? def.decimals);
}

/** Format an SI value for display, with the unit label appended */
export function fmtU(siValue: number, category: string, system: UnitSystem, overrideDecimals?: number): string {
    return `${fmt(siValue, category, system, overrideDecimals)} ${unitLabel(category, system)}`;
}

// ── Temperature helpers (special — non-linear) ────────────

/** Kelvin → display temperature */
export function tempToDisplay(kelvin: number, system: UnitSystem): number {
    if (system === 'us') return (kelvin - 273.15) * 9 / 5 + 32;
    return kelvin - 273.15;
}

/** Display temperature → Kelvin */
export function tempToSI(display: number, system: UnitSystem): number {
    if (system === 'us') return (display - 32) * 5 / 9 + 273.15;
    return display + 273.15;
}

/** Format temperature with unit */
export function fmtTemp(kelvin: number, system: UnitSystem): string {
    const v = tempToDisplay(kelvin, system);
    const u = system === 'us' ? '°F' : '°C';
    return `${Math.round(v)} ${u}`;
}

/** Pressure: Pa → display */
export function pressToDisplay(pa: number, system: UnitSystem): number {
    if (system === 'us') return pa * PA_TO_INHG;
    return pa / 100; // hPa
}

/** Pressure: display → Pa */
export function pressToSI(display: number, system: UnitSystem): number {
    if (system === 'us') return display / PA_TO_INHG;
    return display * 100;
}

export function fmtPress(pa: number, system: UnitSystem): string {
    if (system === 'us') return `${(pa * PA_TO_INHG).toFixed(2)} inHg`;
    return `${(pa / 100).toFixed(0)} hPa`;
}
