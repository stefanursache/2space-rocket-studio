/**
 * IndexedDB-based motor cache for ThrustCurve.org data.
 * Stores motor metadata and thrust curves persistently across sessions.
 *
 * Schema:
 *   motors  – one entry per motor (CachedMotor)
 *   meta    – key/value pairs (e.g. lastSync timestamp)
 */

import { Motor } from '../types/rocket';
import {
    TCSearchResult,
    fetchAllMotors,
    downloadSingleThrustCurve,
} from './thrustcurveApi';

const DB_NAME = 'openrocket-motors';
const DB_VERSION = 1;
const MOTOR_STORE = 'motors';
const META_STORE = 'meta';

/* ================================================================
   IndexedDB Helpers
   ================================================================ */

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(MOTOR_STORE))
                db.createObjectStore(MOTOR_STORE, { keyPath: 'id' });
            if (!db.objectStoreNames.contains(META_STORE))
                db.createObjectStore(META_STORE, { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function putItem(store: string, item: unknown): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(item);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function getItem<T>(store: string, key: string): Promise<T | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => { db.close(); resolve(req.result as T | undefined); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function getAllItems<T>(store: string): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => { db.close(); resolve(req.result as T[]); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function putMany(store: string, items: unknown[]): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        for (const item of items) os.put(item);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function clearStore(store: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/* ================================================================
   Cached motor type – extends Motor with TC-specific fields
   ================================================================ */

export interface CachedMotor extends Motor {
    tcMotorId: string;          // ThrustCurve.org motor ID
    tcUpdatedOn?: string;       // updatedOn from TC API
    hasThrustCurve: boolean;    // whether we have downloaded thrust curve data
}

interface MetaEntry { key: string; value: unknown }

/* ================================================================
   Conversion helpers
   ================================================================ */

function tcResultToMotor(r: TCSearchResult): CachedMotor {
    return {
        id: r.motorId,                  // reuse TC id as our ID
        tcMotorId: r.motorId,
        manufacturer: r.manufacturerAbbrev || r.manufacturer,
        designation: r.designation,
        commonName: r.commonName,
        diameter: r.diameter,            // already mm
        length: r.length,                // already mm
        delays: r.delays || '',
        propellantMass: (r.propWeightG || 0) / 1000,   // g → kg
        totalMass: (r.totalWeightG || 0) / 1000,        // g → kg
        averageThrust: r.avgThrustN || 0,
        maxThrust: r.maxThrustN || 0,
        burnTime: r.burnTimeS || 0,
        totalImpulse: r.totImpulseNs || 0,
        impulseClass: r.impulseClass,
        thrustCurve: [],                 // downloaded lazily
        hasThrustCurve: false,
        tcUpdatedOn: r.updatedOn,
    };
}

/* ================================================================
   Public API
   ================================================================ */

/** Last sync timestamp, or null if never synced. */
export async function getLastSyncDate(): Promise<Date | null> {
    try {
        const entry = await getItem<MetaEntry>(META_STORE, 'lastSync');
        return entry ? new Date(entry.value as string) : null;
    } catch {
        return null;
    }
}

/** True when more than 30 days have elapsed since last sync. */
export async function needsSync(): Promise<boolean> {
    const last = await getLastSyncDate();
    if (!last) return true;
    return (Date.now() - last.getTime()) / 86_400_000 >= 30;
}

/** Return all motors currently in IndexedDB. */
export async function getCachedMotors(): Promise<CachedMotor[]> {
    try {
        return await getAllItems<CachedMotor>(MOTOR_STORE);
    } catch {
        return [];
    }
}

/** Number of motors in the cache. */
export async function getCachedMotorCount(): Promise<number> {
    try {
        const items = await getAllItems<CachedMotor>(MOTOR_STORE);
        return items.length;
    } catch {
        return 0;
    }
}

/**
 * Full sync: fetch all available motors from ThrustCurve.org and store in IDB.
 * Preserves any previously-downloaded thrust curves.
 */
export async function syncMotors(
    onProgress?: (phase: string, current: number, total: number) => void,
): Promise<Motor[]> {
    onProgress?.('Fetching motor catalog…', 0, 1);

    const tcMotors = await fetchAllMotors((loaded, total) => {
        onProgress?.('Fetching motors…', loaded, total);
    });

    onProgress?.('Saving to cache…', 0, 1);

    const motors: CachedMotor[] = tcMotors.map(tcResultToMotor);

    // Preserve previously-downloaded thrust curves
    const existing = await getAllItems<CachedMotor>(MOTOR_STORE);
    const prevMap = new Map(existing.map(m => [m.tcMotorId, m]));
    for (const m of motors) {
        const prev = prevMap.get(m.tcMotorId);
        if (prev?.hasThrustCurve && prev.thrustCurve.length > 0) {
            m.thrustCurve = prev.thrustCurve;
            m.hasThrustCurve = true;
        }
    }

    await clearStore(MOTOR_STORE);
    await putMany(MOTOR_STORE, motors);
    await putItem(META_STORE, { key: 'lastSync', value: new Date().toISOString() });

    onProgress?.('Done', 1, 1);
    return motors;
}

/**
 * Fetch + cache the thrust curve for one motor. Returns the updated Motor.
 */
export async function fetchAndCacheThrustCurve(
    motorId: string,
): Promise<Motor | null> {
    const motor = await getItem<CachedMotor>(MOTOR_STORE, motorId);
    if (!motor) return null;

    // Already have it?
    if (motor.hasThrustCurve && motor.thrustCurve.length > 0) return motor;

    const curve = await downloadSingleThrustCurve(motor.tcMotorId);
    if (curve && curve.length > 0) {
        motor.thrustCurve = curve;
        motor.hasThrustCurve = true;
        await putItem(MOTOR_STORE, motor);
    }
    return motor;
}
