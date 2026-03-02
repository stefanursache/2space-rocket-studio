/**
 * ThrustCurve.org API v1 client
 * https://www.thrustcurve.org/info/api.html
 *
 * All measurements from the API use SI (MKS) units,
 * except motor dimensions which are in millimeters.
 */

const API_BASE = 'https://www.thrustcurve.org/api/v1';

/* ================================================================
   Types matching the ThrustCurve.org JSON API responses
   ================================================================ */

export interface TCSearchResult {
    motorId: string;
    manufacturer: string;
    manufacturerAbbrev: string;
    designation: string;
    commonName: string;
    impulseClass: string;
    diameter: number;        // mm
    length: number;          // mm
    type: string;            // SU | reload | hybrid
    avgThrustN: number;
    maxThrustN: number;
    totImpulseNs: number;
    burnTimeS: number;
    totalWeightG: number;    // grams
    propWeightG: number;     // grams
    delays: string;
    dataFiles: number;
    availability: string;    // regular | occasional | OOP
    updatedOn: string;
    sparky: boolean;
    certOrg: string;
    infoUrl?: string;
    caseInfo?: string;
    propInfo?: string;
}

export interface TCSearchResponse {
    criteria: { name: string; value: string; matches: number; error?: string }[];
    matches: number;
    results?: TCSearchResult[];
}

export interface TCSample {
    time: number;
    thrust: number;
}

export interface TCDownloadResult {
    motorId: string;
    simfileId: string;
    format: string;
    source: string;
    license: string;
    samples?: TCSample[];
    data?: string;
    infoUrl?: string;
    dataUrl?: string;
}

export interface TCDownloadResponse {
    results?: TCDownloadResult[];
    error?: string;
}

export interface TCMetadataResponse {
    manufacturers?: { name: string; abbrev: string }[];
    certOrgs?: { name: string; abbrev: string }[];
    types?: string[];
    diameters?: number[];
    impulseClasses?: string[];
}

/* ================================================================
   API Functions
   ================================================================ */

/**
 * Search for motors matching the given criteria (POST).
 */
export async function searchMotors(
    criteria: Record<string, unknown> = {},
): Promise<TCSearchResponse> {
    const res = await fetch(`${API_BASE}/search.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria),
    });
    if (!res.ok) throw new Error(`ThrustCurve search failed: ${res.status}`);
    return res.json();
}

/**
 * Fetch ALL available motors by iterating over impulse classes.
 * The search endpoint requires at least one criterion, so we query per class.
 */
export async function fetchAllMotors(
    onProgress?: (loaded: number, total: number) => void,
): Promise<TCSearchResult[]> {
    const classes = [
        '1/8A', '1/4A', '1/2A',
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
        'I', 'J', 'K', 'L', 'M', 'N', 'O',
    ];
    const all: TCSearchResult[] = [];

    for (let i = 0; i < classes.length; i++) {
        try {
            const resp = await searchMotors({
                impulseClass: classes[i],
                availability: 'available',
                maxResults: 2000,
            });
            if (resp.results) all.push(...resp.results);
        } catch (e) {
            console.warn(`[ThrustCurve] Failed to fetch class ${classes[i]}:`, e);
        }
        onProgress?.(i + 1, classes.length);
    }

    // De-duplicate by motorId
    const seen = new Set<string>();
    return all.filter(m => {
        if (seen.has(m.motorId)) return false;
        seen.add(m.motorId);
        return true;
    });
}

/**
 * Download parsed thrust-curve sample data for one or more motors.
 * Returns a Map of motorId → [time, thrust][] pairs.
 */
export async function downloadThrustCurves(
    motorIds: string[],
): Promise<Map<string, [number, number][]>> {
    const result = new Map<string, [number, number][]>();
    const batchSize = 20;

    for (let i = 0; i < motorIds.length; i += batchSize) {
        const batch = motorIds.slice(i, i + batchSize);
        try {
            const res = await fetch(`${API_BASE}/download.json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motorIds: batch, data: 'samples' }),
            });
            if (!res.ok) continue;
            const data: TCDownloadResponse = await res.json();
            if (!data.results) continue;

            // Group by motorId, keep the file with the most data points
            const byMotor = new Map<string, TCSample[]>();
            for (const r of data.results) {
                if (r.samples && r.samples.length > 0) {
                    const existing = byMotor.get(r.motorId);
                    if (!existing || r.samples.length > existing.length) {
                        byMotor.set(r.motorId, r.samples);
                    }
                }
            }

            for (const [motorId, samples] of byMotor) {
                const curve: [number, number][] = samples.map(s => [s.time, s.thrust]);
                if (curve.length > 0 && curve[0][0] > 0.001) curve.unshift([0, 0]);
                result.set(motorId, curve);
            }
        } catch (e) {
            console.warn('[ThrustCurve] Download batch failed:', e);
        }
    }

    return result;
}

/**
 * Download the thrust curve for a single motor.
 */
export async function downloadSingleThrustCurve(
    motorId: string,
): Promise<[number, number][] | null> {
    const map = await downloadThrustCurves([motorId]);
    return map.get(motorId) ?? null;
}
