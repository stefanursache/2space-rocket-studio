// ============================================================
// Auth Service — Secure client-side authentication with
// Web Crypto API (PBKDF2 + SHA-256) and IndexedDB storage
// ============================================================

const DB_NAME = '2space-auth';
const DB_VERSION = 2; // bumped for user_rockets + user_preferences + config stores
const USERS_STORE = 'users';
const SESSIONS_STORE = 'sessions';
const SIMULATIONS_STORE = 'user_simulations';
const ROCKETS_STORE = 'user_rockets';
const PREFERENCES_STORE = 'user_preferences';
const CONFIG_STORE = 'app_config';

// ---- Crypto helpers (PBKDF2) ------------------------------------

/** Generate a random 16-byte salt */
function generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
}

/** Generate a random session token */
function generateToken(): string {
    const arr = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/** Derive a key from password using PBKDF2 (100k iterations, SHA-256) */
async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    return crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' },
        keyMaterial, 256
    );
}

/** Hash a password with a salt, return hex string */
async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
    const bits = await deriveKey(password, salt);
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}

/** Convert Uint8Array to hex string for storage */
function toHex(arr: Uint8Array): string {
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/** Convert hex string back to Uint8Array */
function fromHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

// ---- User types -------------------------------------------------

export interface StoredUser {
    id: string;
    username: string;
    email: string;
    passwordHash: string; // hex
    salt: string;         // hex
    role: 'user' | 'admin';
    createdAt: string;    // ISO
    lastLogin: string | null;
    disabled: boolean;
    simulationCount: number;
}

export interface UserSession {
    token: string;
    userId: string;
    username: string;
    role: 'user' | 'admin';
    createdAt: string;
    expiresAt: string;
}

export interface UserSimulation {
    id: string;
    userId: string;
    name: string;
    rocketName: string;
    createdAt: string;
    data: string; // JSON blob
}

export interface UserRocket {
    id: string;
    userId: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    data: string; // JSON blob of rocket design
    thumbnail: string; // base64 mini preview or empty
}

export interface UserPreferences {
    userId: string;
    loginButtonColor: string;  // hex color for the login/register button
    accentColor: string;       // user accent color
    theme: 'dark' | 'light';   // only dark for now but future-proof
}

// ---- IndexedDB --------------------------------------------------

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(USERS_STORE)) {
                const store = db.createObjectStore(USERS_STORE, { keyPath: 'id' });
                store.createIndex('username', 'username', { unique: true });
                store.createIndex('email', 'email', { unique: true });
            }
            if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
                db.createObjectStore(SESSIONS_STORE, { keyPath: 'token' });
            }
            if (!db.objectStoreNames.contains(SIMULATIONS_STORE)) {
                const simStore = db.createObjectStore(SIMULATIONS_STORE, { keyPath: 'id' });
                simStore.createIndex('userId', 'userId', { unique: false });
            }
            if (!db.objectStoreNames.contains(ROCKETS_STORE)) {
                const rocketStore = db.createObjectStore(ROCKETS_STORE, { keyPath: 'id' });
                rocketStore.createIndex('userId', 'userId', { unique: false });
            }
            if (!db.objectStoreNames.contains(PREFERENCES_STORE)) {
                db.createObjectStore(PREFERENCES_STORE, { keyPath: 'userId' });
            }
            if (!db.objectStoreNames.contains(CONFIG_STORE)) {
                db.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbGet<T>(storeName: string, key: string): Promise<T | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbPut<T>(storeName: string, value: T): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function dbDelete(storeName: string, key: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function dbGetAll<T>(storeName: string): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbGetByIndex<T>(storeName: string, indexName: string, key: string): Promise<T | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const req = index.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbGetAllByIndex<T>(storeName: string, indexName: string, key: string): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const req = index.getAll(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ---- Validation -------------------------------------------------

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

export function validateUsername(username: string): string | null {
    if (!username) return 'Username is required';
    if (username.length < 3) return 'Username must be at least 3 characters';
    if (username.length > 30) return 'Username must be at most 30 characters';
    if (!USERNAME_RE.test(username)) return 'Username can only contain letters, numbers, hyphens, and underscores';
    return null;
}

export function validateEmail(email: string): string | null {
    if (!email) return 'Email is required';
    if (!EMAIL_RE.test(email)) return 'Invalid email address';
    return null;
}

export function validatePassword(password: string): string | null {
    if (!password) return 'Password is required';
    if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return 'Password must contain at least one special character';
    return null;
}

// ---- Session management -----------------------------------------

const SESSION_KEY = '2space_session_token';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function storeSessionToken(token: string): void {
    sessionStorage.setItem(SESSION_KEY, token);
}

function getSessionToken(): string | null {
    return sessionStorage.getItem(SESSION_KEY);
}

function clearSessionToken(): void {
    sessionStorage.removeItem(SESSION_KEY);
}

// ---- Public API -------------------------------------------------

/** Ensure the default admin user exists (first-time setup) */
export async function ensureDefaultAdmin(): Promise<void> {
    const existing = await dbGetByIndex<StoredUser>(USERS_STORE, 'username', 'admin');
    if (existing) return;

    const salt = generateSalt();
    const hash = await hashPassword('Admin123!', salt);
    const admin: StoredUser = {
        id: crypto.randomUUID(),
        username: 'admin',
        email: 'admin@2space.local',
        passwordHash: hash,
        salt: toHex(salt),
        role: 'admin',
        createdAt: new Date().toISOString(),
        lastLogin: null,
        disabled: false,
        simulationCount: 0,
    };
    await dbPut(USERS_STORE, admin);
}

/** Register a new user */
export async function registerUser(
    username: string, email: string, password: string
): Promise<{ success: boolean; error?: string }> {
    // Validate
    const uErr = validateUsername(username);
    if (uErr) return { success: false, error: uErr };
    const eErr = validateEmail(email);
    if (eErr) return { success: false, error: eErr };
    const pErr = validatePassword(password);
    if (pErr) return { success: false, error: pErr };

    // Check uniqueness
    const byUsername = await dbGetByIndex<StoredUser>(USERS_STORE, 'username', username);
    if (byUsername) return { success: false, error: 'Username already taken' };
    const byEmail = await dbGetByIndex<StoredUser>(USERS_STORE, 'email', email);
    if (byEmail) return { success: false, error: 'Email already registered' };

    // Hash password
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);

    const user: StoredUser = {
        id: crypto.randomUUID(),
        username,
        email,
        passwordHash: hash,
        salt: toHex(salt),
        role: 'user',
        createdAt: new Date().toISOString(),
        lastLogin: null,
        disabled: false,
        simulationCount: 0,
    };

    await dbPut(USERS_STORE, user);
    return { success: true };
}

/** Login with username and password */
export async function loginUser(
    username: string, password: string
): Promise<{ success: boolean; session?: UserSession; error?: string }> {
    if (!username || !password) return { success: false, error: 'Username and password are required' };

    const user = await dbGetByIndex<StoredUser>(USERS_STORE, 'username', username);
    if (!user) return { success: false, error: 'Invalid username or password' };
    if (user.disabled) return { success: false, error: 'Account is disabled. Contact administrator.' };

    // Verify password
    const hash = await hashPassword(password, fromHex(user.salt));
    if (hash !== user.passwordHash) return { success: false, error: 'Invalid username or password' };

    // Create session
    const now = new Date();
    const session: UserSession = {
        token: generateToken(),
        userId: user.id,
        username: user.username,
        role: user.role,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SESSION_DURATION_MS).toISOString(),
    };

    await dbPut(SESSIONS_STORE, session);
    storeSessionToken(session.token);

    // Update last login
    user.lastLogin = now.toISOString();
    await dbPut(USERS_STORE, user);

    return { success: true, session };
}

/** Get the current session (if valid) */
export async function getCurrentSession(): Promise<UserSession | null> {
    const token = getSessionToken();
    if (!token) return null;

    const session = await dbGet<UserSession>(SESSIONS_STORE, token);
    if (!session) { clearSessionToken(); return null; }

    // Check expiry
    if (new Date(session.expiresAt) < new Date()) {
        await dbDelete(SESSIONS_STORE, token);
        clearSessionToken();
        return null;
    }

    return session;
}

/** Logout */
export async function logout(): Promise<void> {
    const token = getSessionToken();
    if (token) {
        await dbDelete(SESSIONS_STORE, token);
    }
    clearSessionToken();
}

/** Get all users (admin only) */
export async function getAllUsers(): Promise<StoredUser[]> {
    return dbGetAll<StoredUser>(USERS_STORE);
}

/** Update a user (admin only) */
export async function updateUser(userId: string, updates: Partial<Pick<StoredUser, 'email' | 'role' | 'disabled'>>): Promise<{ success: boolean; error?: string }> {
    const user = await dbGet<StoredUser>(USERS_STORE, userId);
    if (!user) return { success: false, error: 'User not found' };

    if (updates.email !== undefined) {
        const eErr = validateEmail(updates.email);
        if (eErr) return { success: false, error: eErr };
        // Check uniqueness
        const byEmail = await dbGetByIndex<StoredUser>(USERS_STORE, 'email', updates.email);
        if (byEmail && byEmail.id !== userId) return { success: false, error: 'Email already in use' };
        user.email = updates.email;
    }
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.disabled !== undefined) user.disabled = updates.disabled;

    await dbPut(USERS_STORE, user);
    return { success: true };
}

/** Reset a user's password (admin only) */
export async function resetUserPassword(userId: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const pErr = validatePassword(newPassword);
    if (pErr) return { success: false, error: pErr };

    const user = await dbGet<StoredUser>(USERS_STORE, userId);
    if (!user) return { success: false, error: 'User not found' };

    const salt = generateSalt();
    const hash = await hashPassword(newPassword, salt);
    user.passwordHash = hash;
    user.salt = toHex(salt);
    await dbPut(USERS_STORE, user);

    // Invalidate all sessions for this user
    const allSessions = await dbGetAll<UserSession>(SESSIONS_STORE);
    for (const sess of allSessions) {
        if (sess.userId === userId) {
            await dbDelete(SESSIONS_STORE, sess.token);
        }
    }

    return { success: true };
}

/** Delete a user (admin only) */
export async function deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    const user = await dbGet<StoredUser>(USERS_STORE, userId);
    if (!user) return { success: false, error: 'User not found' };
    if (user.username === 'admin') return { success: false, error: 'Cannot delete the default admin user' };

    // Delete all their sessions
    const allSessions = await dbGetAll<UserSession>(SESSIONS_STORE);
    for (const sess of allSessions) {
        if (sess.userId === userId) await dbDelete(SESSIONS_STORE, sess.token);
    }

    // Delete all their simulations
    const sims = await dbGetAllByIndex<UserSimulation>(SIMULATIONS_STORE, 'userId', userId);
    for (const sim of sims) await dbDelete(SIMULATIONS_STORE, sim.id);

    // Delete user
    await dbDelete(USERS_STORE, userId);
    return { success: true };
}

/** Save a simulation for the current user */
export async function saveUserSimulation(
    userId: string, name: string, rocketName: string, data: string
): Promise<void> {
    const sim: UserSimulation = {
        id: crypto.randomUUID(),
        userId,
        name,
        rocketName,
        createdAt: new Date().toISOString(),
        data,
    };
    await dbPut(SIMULATIONS_STORE, sim);

    // Update count
    const user = await dbGet<StoredUser>(USERS_STORE, userId);
    if (user) {
        user.simulationCount = (user.simulationCount || 0) + 1;
        await dbPut(USERS_STORE, user);
    }
}

/** Get all simulations for a user */
export async function getUserSimulations(userId: string): Promise<UserSimulation[]> {
    return dbGetAllByIndex<UserSimulation>(SIMULATIONS_STORE, 'userId', userId);
}

/** Get ALL simulations (admin) */
export async function getAllSimulations(): Promise<UserSimulation[]> {
    return dbGetAll<UserSimulation>(SIMULATIONS_STORE);
}

/** Delete a simulation */
export async function deleteSimulation(simId: string): Promise<void> {
    const sim = await dbGet<UserSimulation>(SIMULATIONS_STORE, simId);
    if (sim) {
        await dbDelete(SIMULATIONS_STORE, simId);
        const user = await dbGet<StoredUser>(USERS_STORE, sim.userId);
        if (user && user.simulationCount > 0) {
            user.simulationCount--;
            await dbPut(USERS_STORE, user);
        }
    }
}

/** Change own password (logged in user) */
export async function changeOwnPassword(
    userId: string, currentPassword: string, newPassword: string
): Promise<{ success: boolean; error?: string }> {
    const user = await dbGet<StoredUser>(USERS_STORE, userId);
    if (!user) return { success: false, error: 'User not found' };

    // Verify current password
    const currentHash = await hashPassword(currentPassword, fromHex(user.salt));
    if (currentHash !== user.passwordHash) return { success: false, error: 'Current password is incorrect' };

    const pErr = validatePassword(newPassword);
    if (pErr) return { success: false, error: pErr };

    const salt = generateSalt();
    const hash = await hashPassword(newPassword, salt);
    user.passwordHash = hash;
    user.salt = toHex(salt);
    await dbPut(USERS_STORE, user);

    return { success: true };
}

// ---- User rockets (saved designs per user) ----------------------

/** Save a rocket design for the current user */
export async function saveUserRocket(
    userId: string, name: string, description: string, data: string
): Promise<UserRocket> {
    const rocket: UserRocket = {
        id: crypto.randomUUID(),
        userId,
        name,
        description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data,
        thumbnail: '',
    };
    await dbPut(ROCKETS_STORE, rocket);
    return rocket;
}

/** Update an existing user rocket */
export async function updateUserRocket(
    rocketId: string, updates: Partial<Pick<UserRocket, 'name' | 'description' | 'data'>>
): Promise<{ success: boolean; error?: string }> {
    const rocket = await dbGet<UserRocket>(ROCKETS_STORE, rocketId);
    if (!rocket) return { success: false, error: 'Rocket not found' };
    if (updates.name !== undefined) rocket.name = updates.name;
    if (updates.description !== undefined) rocket.description = updates.description;
    if (updates.data !== undefined) rocket.data = updates.data;
    rocket.updatedAt = new Date().toISOString();
    await dbPut(ROCKETS_STORE, rocket);
    return { success: true };
}

/** Get all rockets for a user */
export async function getUserRockets(userId: string): Promise<UserRocket[]> {
    return dbGetAllByIndex<UserRocket>(ROCKETS_STORE, 'userId', userId);
}

/** Get ALL rockets (admin) */
export async function getAllRockets(): Promise<UserRocket[]> {
    return dbGetAll<UserRocket>(ROCKETS_STORE);
}

/** Delete a rocket design */
export async function deleteUserRocket(rocketId: string): Promise<void> {
    await dbDelete(ROCKETS_STORE, rocketId);
}

// ---- User preferences -------------------------------------------

const DEFAULT_PREFERENCES: Omit<UserPreferences, 'userId'> = {
    loginButtonColor: '#3b8eed',
    accentColor: '#3b8eed',
    theme: 'dark',
};

/** Get preferences for a user (returns defaults if none stored) */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
    const prefs = await dbGet<UserPreferences>(PREFERENCES_STORE, userId);
    if (prefs) return prefs;
    return { userId, ...DEFAULT_PREFERENCES };
}

/** Update preferences for a user */
export async function updateUserPreferences(
    userId: string, updates: Partial<Omit<UserPreferences, 'userId'>>
): Promise<UserPreferences> {
    const existing = await getUserPreferences(userId);
    const updated: UserPreferences = { ...existing, ...updates, userId };
    await dbPut(PREFERENCES_STORE, updated);
    return updated;
}

// ---- Change username -------------------------------------------

/** Change own username */
export async function changeUsername(
    userId: string, newUsername: string
): Promise<{ success: boolean; error?: string }> {
    const uErr = validateUsername(newUsername);
    if (uErr) return { success: false, error: uErr };

    // Check uniqueness
    const existing = await dbGetByIndex<StoredUser>(USERS_STORE, 'username', newUsername);
    if (existing && existing.id !== userId) return { success: false, error: 'Username already taken' };

    const user = await dbGet<StoredUser>(USERS_STORE, userId);
    if (!user) return { success: false, error: 'User not found' };

    user.username = newUsername;
    await dbPut(USERS_STORE, user);

    // Update active sessions for this user
    const allSessions = await dbGetAll<UserSession>(SESSIONS_STORE);
    for (const sess of allSessions) {
        if (sess.userId === userId) {
            sess.username = newUsername;
            await dbPut(SESSIONS_STORE, sess);
        }
    }

    return { success: true };
}

/** Change own email */
export async function changeEmail(
    userId: string, newEmail: string
): Promise<{ success: boolean; error?: string }> {
    const eErr = validateEmail(newEmail);
    if (eErr) return { success: false, error: eErr };

    const existing = await dbGetByIndex<StoredUser>(USERS_STORE, 'email', newEmail);
    if (existing && existing.id !== userId) return { success: false, error: 'Email already in use' };

    const user = await dbGet<StoredUser>(USERS_STORE, userId);
    if (!user) return { success: false, error: 'User not found' };

    user.email = newEmail;
    await dbPut(USERS_STORE, user);
    return { success: true };
}

// ---- Device fingerprint for admin lock --------------------------

const DEVICE_FP_KEY = '2space_device_fp';

/**
 * Generate a stable device fingerprint using browser properties.
 * Combined with a random component stored in localStorage for uniqueness.
 */
export function generateDeviceFingerprint(): string {
    // Check if we already have a fingerprint for this device
    const stored = localStorage.getItem(DEVICE_FP_KEY);
    if (stored) return stored;

    // Build fingerprint from stable browser properties
    const components = [
        navigator.userAgent,
        navigator.language,
        navigator.hardwareConcurrency?.toString() || '',
        screen.width + 'x' + screen.height,
        screen.colorDepth?.toString() || '',
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.platform || '',
        // Add a random salt so different browsers on same machine get different FPs
        crypto.randomUUID(),
    ];

    // Simple hash (DJB2-like)
    const raw = components.join('|');
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) + hash + raw.charCodeAt(i)) & 0xffffffff;
    }
    const fp = 'dev_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);

    localStorage.setItem(DEVICE_FP_KEY, fp);
    return fp;
}

/** Get the current device fingerprint (or generate if missing) */
export function getDeviceFingerprint(): string {
    return generateDeviceFingerprint();
}

/** Store the authorized device fingerprint in IndexedDB */
export async function authorizeDevice(fingerprint: string): Promise<void> {
    await dbPut(CONFIG_STORE, { key: 'authorized_admin_device', value: fingerprint, authorizedAt: new Date().toISOString() });
}

/** Check if admin access has been set up on any device */
export async function getAuthorizedDevice(): Promise<string | null> {
    const config = await dbGet<{ key: string; value: string }>(CONFIG_STORE, 'authorized_admin_device');
    return config?.value || null;
}

/** Check if current device is the authorized admin device */
export async function isAuthorizedAdminDevice(): Promise<boolean> {
    const authorizedFP = await getAuthorizedDevice();
    if (!authorizedFP) return true; // No device authorized yet — allow first setup
    return authorizedFP === getDeviceFingerprint();
}

/** Revoke device authorization (admin can re-authorize) */
export async function revokeDeviceAuthorization(): Promise<void> {
    await dbDelete(CONFIG_STORE, 'authorized_admin_device');
}

/** Get user by ID */
export async function getUserById(userId: string): Promise<StoredUser | undefined> {
    return dbGet<StoredUser>(USERS_STORE, userId);
}
