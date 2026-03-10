// ============================================================
// Auth Service — HTTP API client for MongoDB-backed auth
// Replaces IndexedDB with REST calls to the Express backend.
// All exported function signatures are kept identical so that
// useAuthStore, AuthModal, AdminPanel, UserSettings, etc. work
// without any changes.
// ============================================================

const API_BASE = '/api';

// ---- Session token management (sessionStorage) ----------------

const SESSION_KEY = '2space_session_token';

function getToken(): string | null {
    return sessionStorage.getItem(SESSION_KEY);
}

function storeToken(token: string): void {
    sessionStorage.setItem(SESSION_KEY, token);
}

function clearToken(): void {
    sessionStorage.removeItem(SESSION_KEY);
}

// ---- HTTP helper -----------------------------------------------

function authHeaders(): Record<string, string> {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...authHeaders(), ...(options?.headers || {}) },
    });
    return res.json();
}

// ---- User types (unchanged) ------------------------------------

export interface StoredUser {
    id: string;
    username: string;
    email: string;
    passwordHash: string; // empty from API — kept for type compat
    salt: string;         // empty from API — kept for type compat
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
    loginButtonColor: string;
    accentColor: string;
    theme: 'dark' | 'light';
}

// ---- Validation (client-side, no change) -----------------------

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
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]/.test(password)) return 'Password must contain at least one special character';
    return null;
}

// ---- Public API ------------------------------------------------

/** Ensure the default admin user exists (handled server-side automatically on boot) */
export async function ensureDefaultAdmin(): Promise<void> {
    // Admin seeding is now done server-side in the DB middleware.
    // This function is kept for API compatibility — it's a no-op.
    return;
}

/** Register a new user */
export async function registerUser(
    username: string, email: string, password: string
): Promise<{ success: boolean; error?: string }> {
    const uErr = validateUsername(username);
    if (uErr) return { success: false, error: uErr };
    const eErr = validateEmail(email);
    if (eErr) return { success: false, error: eErr };
    const pErr = validatePassword(password);
    if (pErr) return { success: false, error: pErr };

    return api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
    });
}

/** Login with username and password */
export async function loginUser(
    username: string, password: string
): Promise<{ success: boolean; session?: UserSession; error?: string }> {
    if (!username || !password) return { success: false, error: 'Username and password are required' };

    const result = await api<{ success: boolean; session?: UserSession; error?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });

    if (result.success && result.session) {
        storeToken(result.session.token);
    }

    return result;
}

/** Get the current session (if valid) */
export async function getCurrentSession(): Promise<UserSession | null> {
    const token = getToken();
    if (!token) return null;

    try {
        const session = await api<UserSession | null>('/auth/session');
        if (!session) {
            clearToken();
            return null;
        }
        return session;
    } catch {
        clearToken();
        return null;
    }
}

/** Logout */
export async function logout(): Promise<void> {
    try {
        await api('/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    clearToken();
}

// ---- User management -------------------------------------------

/** Get all users (admin only) */
export async function getAllUsers(): Promise<StoredUser[]> {
    return api('/users');
}

/** Update a user (admin only) */
export async function updateUser(
    userId: string, updates: Partial<Pick<StoredUser, 'email' | 'role' | 'disabled'>>
): Promise<{ success: boolean; error?: string }> {
    return api(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

/** Reset a user's password (admin only) */
export async function resetUserPassword(
    userId: string, newPassword: string
): Promise<{ success: boolean; error?: string }> {
    const pErr = validatePassword(newPassword);
    if (pErr) return { success: false, error: pErr };

    return api(`/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
    });
}

/** Delete a user (admin only) */
export async function deleteUser(
    userId: string
): Promise<{ success: boolean; error?: string }> {
    return api(`/users/${userId}`, { method: 'DELETE' });
}

/** Get user by ID */
export async function getUserById(userId: string): Promise<StoredUser | undefined> {
    try {
        return await api<StoredUser>(`/users/${userId}`);
    } catch {
        return undefined;
    }
}

/** Change own password */
export async function changeOwnPassword(
    userId: string, currentPassword: string, newPassword: string
): Promise<{ success: boolean; error?: string }> {
    const pErr = validatePassword(newPassword);
    if (pErr) return { success: false, error: pErr };

    return api('/users/me/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
    });
}

/** Change own username */
export async function changeUsername(
    userId: string, newUsername: string
): Promise<{ success: boolean; error?: string }> {
    const uErr = validateUsername(newUsername);
    if (uErr) return { success: false, error: uErr };

    return api('/users/me/change-username', {
        method: 'POST',
        body: JSON.stringify({ newUsername }),
    });
}

/** Change own email */
export async function changeEmail(
    userId: string, newEmail: string
): Promise<{ success: boolean; error?: string }> {
    const eErr = validateEmail(newEmail);
    if (eErr) return { success: false, error: eErr };

    return api('/users/me/change-email', {
        method: 'POST',
        body: JSON.stringify({ newEmail }),
    });
}

// ---- Simulations ------------------------------------------------

/** Save a simulation for the current user */
export async function saveUserSimulation(
    userId: string, name: string, rocketName: string, data: string
): Promise<void> {
    await api('/simulations', {
        method: 'POST',
        body: JSON.stringify({ name, rocketName, data }),
    });
}

/** Get all simulations for a user */
export async function getUserSimulations(userId: string): Promise<UserSimulation[]> {
    return api('/simulations');
}

/** Get ALL simulations (admin) */
export async function getAllSimulations(): Promise<UserSimulation[]> {
    return api('/simulations/all');
}

/** Delete a simulation */
export async function deleteSimulation(simId: string): Promise<void> {
    await api(`/simulations/${simId}`, { method: 'DELETE' });
}

// ---- User rockets -----------------------------------------------

/** Save a rocket design for the current user */
export async function saveUserRocket(
    userId: string, name: string, description: string, data: string
): Promise<UserRocket> {
    return api('/rockets', {
        method: 'POST',
        body: JSON.stringify({ name, description, data }),
    });
}

/** Update an existing user rocket */
export async function updateUserRocket(
    rocketId: string, updates: Partial<Pick<UserRocket, 'name' | 'description' | 'data'>>
): Promise<{ success: boolean; error?: string }> {
    return api(`/rockets/${rocketId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

/** Get all rockets for a user (list view — no data field for efficiency) */
export async function getUserRockets(userId: string): Promise<UserRocket[]> {
    return api('/rockets');
}

/** Get a single rocket with full data */
export async function getRocketById(rocketId: string): Promise<UserRocket> {
    return api(`/rockets/${rocketId}`);
}

/** Get ALL rockets (admin) */
export async function getAllRockets(): Promise<UserRocket[]> {
    return api('/rockets/all');
}

/** Delete a rocket design */
export async function deleteUserRocket(rocketId: string): Promise<void> {
    await api(`/rockets/${rocketId}`, { method: 'DELETE' });
}

// ---- User preferences -------------------------------------------

/** Get preferences for a user (returns defaults if none stored) */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
    return api('/preferences');
}

/** Update preferences for a user */
export async function updateUserPreferences(
    userId: string, updates: Partial<Omit<UserPreferences, 'userId'>>
): Promise<UserPreferences> {
    return api('/preferences', {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

// ---- Device fingerprint (stays client-side) ---------------------

const DEVICE_FP_KEY = '2space_device_fp';

/**
 * Generate a stable device fingerprint using browser properties.
 * Combined with a random component stored in localStorage for uniqueness.
 */
export function generateDeviceFingerprint(): string {
    const stored = localStorage.getItem(DEVICE_FP_KEY);
    if (stored) return stored;

    const components = [
        navigator.userAgent,
        navigator.language,
        navigator.hardwareConcurrency?.toString() || '',
        screen.width + 'x' + screen.height,
        screen.colorDepth?.toString() || '',
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.platform || '',
        crypto.randomUUID(),
    ];

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

/** Store the authorized device fingerprint */
export async function authorizeDevice(fingerprint: string): Promise<void> {
    await api('/config/authorize-device', {
        method: 'POST',
        body: JSON.stringify({ fingerprint }),
    });
}

/** Check if admin access has been set up on any device */
export async function getAuthorizedDevice(): Promise<string | null> {
    try {
        const result = await api<{ value: string | null }>('/config/authorized-device');
        return result.value;
    } catch {
        return null;
    }
}

/** Check if current device is the authorized admin device */
export async function isAuthorizedAdminDevice(): Promise<boolean> {
    try {
        const authorizedFP = await getAuthorizedDevice();
        if (!authorizedFP) return true; // No device authorized yet — allow first setup
        return authorizedFP === getDeviceFingerprint();
    } catch {
        return true;
    }
}

/** Revoke device authorization (admin can re-authorize) */
export async function revokeDeviceAuthorization(): Promise<void> {
    await api('/config/authorized-device', { method: 'DELETE' });
}

// ---- Workspaces ------------------------------------------------

export type MemberPermission = 'readonly' | 'read-write' | 'download';

export interface WorkspaceMember {
    userId: string;
    email: string;
    username: string;
    permission: MemberPermission;
    joinedAt: string;
}

export interface WorkspaceInfo {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    ownerUsername: string;
    rocketId: string;
    rocketName: string;
    members: WorkspaceMember[];
    createdAt: string;
    updatedAt: string;
}

/** Get all workspaces where user is owner or member */
export async function getWorkspaces(): Promise<WorkspaceInfo[]> {
    return api('/workspaces');
}

/** Create a new workspace linked to a rocket */
export async function createWorkspace(
    name: string, rocketId?: string, description?: string
): Promise<{ success: boolean; workspace?: WorkspaceInfo; error?: string }> {
    return api('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name, rocketId: rocketId || '', description: description || '' }),
    });
}

/** Get a single workspace */
export async function getWorkspace(workspaceId: string): Promise<WorkspaceInfo> {
    return api(`/workspaces/${workspaceId}`);
}

/** Update workspace name/description (owner only) */
export async function updateWorkspace(
    workspaceId: string, updates: { name?: string; description?: string }
): Promise<{ success: boolean; workspace?: WorkspaceInfo; error?: string }> {
    return api(`/workspaces/${workspaceId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

/** Delete a workspace (owner only) */
export async function deleteWorkspace(
    workspaceId: string
): Promise<{ success: boolean; error?: string }> {
    return api(`/workspaces/${workspaceId}`, { method: 'DELETE' });
}

/** Add a member by email (owner only) */
export async function addWorkspaceMember(
    workspaceId: string, email: string, permission: MemberPermission = 'readonly'
): Promise<{ success: boolean; workspace?: WorkspaceInfo; error?: string }> {
    return api(`/workspaces/${workspaceId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, permission }),
    });
}

/** Change a member's permission (owner only) */
export async function updateMemberPermission(
    workspaceId: string, userId: string, permission: MemberPermission
): Promise<{ success: boolean; workspace?: WorkspaceInfo; error?: string }> {
    return api(`/workspaces/${workspaceId}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ permission }),
    });
}

/** Remove a member or leave workspace */
export async function removeWorkspaceMember(
    workspaceId: string, userId: string
): Promise<{ success: boolean; error?: string }> {
    return api(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' });
}

/** Get the shared rocket data from a workspace */
export async function getWorkspaceRocket(
    workspaceId: string
): Promise<{ rocket: UserRocket; permission: MemberPermission }> {
    return api(`/workspaces/${workspaceId}/rocket`);
}

/** Update the shared rocket in a workspace (owner or read-write) */
export async function updateWorkspaceRocket(
    workspaceId: string, updates: { name?: string; description?: string; data?: string }
): Promise<{ success: boolean; error?: string }> {
    return api(`/workspaces/${workspaceId}/rocket`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}
