// ============================================================
// Auth Store — Zustand store for authentication state
// ============================================================

import { create } from 'zustand';
import {
    UserSession, ensureDefaultAdmin, loginUser, registerUser,
    logout as logoutService, getCurrentSession, StoredUser,
    getAllUsers, updateUser, resetUserPassword, deleteUser,
    getAllSimulations, getUserSimulations, deleteSimulation as deleteSimService,
    UserSimulation, changeOwnPassword,
    UserRocket, saveUserRocket, getUserRockets, deleteUserRocket, updateUserRocket, getAllRockets,
    UserPreferences, getUserPreferences, updateUserPreferences,
    changeUsername, changeEmail,
    isAuthorizedAdminDevice, authorizeDevice, getDeviceFingerprint, getAuthorizedDevice,
    revokeDeviceAuthorization, getUserById,
} from '../services/authService';

interface AuthState {
    // State
    session: UserSession | null;
    isLoading: boolean;
    showAuthModal: boolean;
    showAdminPanel: boolean;
    showUserRockets: boolean;
    showUserSettings: boolean;
    showWorkspaces: boolean;
    authError: string | null;
    preferences: UserPreferences | null;
    isAdminDeviceAuthorized: boolean;

    // Actions
    init: () => Promise<void>;
    login: (username: string, password: string) => Promise<boolean>;
    register: (username: string, email: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    setShowAuthModal: (show: boolean) => void;
    setShowAdminPanel: (show: boolean) => void;
    setShowUserRockets: (show: boolean) => void;
    setShowUserSettings: (show: boolean) => void;
    setShowWorkspaces: (show: boolean) => void;
    clearError: () => void;

    // User profile actions
    changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
    changeUserName: (newUsername: string) => Promise<{ success: boolean; error?: string }>;
    changeUserEmail: (newEmail: string) => Promise<{ success: boolean; error?: string }>;

    // User rockets
    fetchUserRockets: () => Promise<UserRocket[]>;
    saveRocket: (name: string, description: string, data: string) => Promise<UserRocket | null>;
    updateRocket: (rocketId: string, updates: Partial<Pick<UserRocket, 'name' | 'description' | 'data'>>) => Promise<{ success: boolean; error?: string }>;
    removeRocket: (rocketId: string) => Promise<void>;

    // Preferences
    loadPreferences: () => Promise<void>;
    updatePrefs: (updates: Partial<Omit<UserPreferences, 'userId'>>) => Promise<void>;

    // Admin actions
    fetchUsers: () => Promise<StoredUser[]>;
    adminUpdateUser: (userId: string, updates: Partial<Pick<StoredUser, 'email' | 'role' | 'disabled'>>) => Promise<{ success: boolean; error?: string }>;
    adminResetPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
    adminDeleteUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
    adminFetchAllSimulations: () => Promise<UserSimulation[]>;
    adminDeleteSimulation: (simId: string) => Promise<void>;
    adminFetchAllRockets: () => Promise<UserRocket[]>;
    adminDeleteRocket: (rocketId: string) => Promise<void>;

    // Device authorization
    checkAdminDeviceAuth: () => Promise<boolean>;
    authorizeThisDevice: () => Promise<void>;
    revokeDevice: () => Promise<void>;
    getDeviceFP: () => string;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    session: null,
    isLoading: true,
    showAuthModal: false,
    showAdminPanel: false,
    showUserRockets: false,
    showUserSettings: false,
    showWorkspaces: false,
    authError: null,
    preferences: null,
    isAdminDeviceAuthorized: false,

    init: async () => {
        try {
            await ensureDefaultAdmin();
            const session = await getCurrentSession();
            set({ session, isLoading: false });
            if (session) {
                const prefs = await getUserPreferences(session.userId);
                const isAuth = await isAuthorizedAdminDevice();
                set({ preferences: prefs, isAdminDeviceAuthorized: isAuth });
            }
        } catch {
            set({ isLoading: false });
        }
    },

    login: async (username, password) => {
        set({ authError: null });
        try {
            const result = await loginUser(username, password);
            if (result.success && result.session) {
                const prefs = await getUserPreferences(result.session.userId);
                const isAuth = await isAuthorizedAdminDevice();
                set({ session: result.session, showAuthModal: false, authError: null, preferences: prefs, isAdminDeviceAuthorized: isAuth });
                return true;
            }
            set({ authError: result.error || 'Login failed' });
            return false;
        } catch {
            set({ authError: 'An unexpected error occurred' });
            return false;
        }
    },

    register: async (username, email, password) => {
        set({ authError: null });
        try {
            const result = await registerUser(username, email, password);
            if (result.success) {
                return get().login(username, password);
            }
            set({ authError: result.error || 'Registration failed' });
            return false;
        } catch {
            set({ authError: 'An unexpected error occurred' });
            return false;
        }
    },

    logout: async () => {
        await logoutService();
        set({ session: null, showAdminPanel: false, showUserRockets: false, showUserSettings: false, showWorkspaces: false, preferences: null });
    },

    setShowAuthModal: (show) => set({ showAuthModal: show, authError: null }),
    setShowAdminPanel: (show) => set({ showAdminPanel: show }),
    setShowUserRockets: (show) => set({ showUserRockets: show }),
    setShowUserSettings: (show) => set({ showUserSettings: show }),
    setShowWorkspaces: (show) => set({ showWorkspaces: show }),
    clearError: () => set({ authError: null }),

    // User profile
    changePassword: async (currentPassword, newPassword) => {
        const session = get().session;
        if (!session) return { success: false, error: 'Not logged in' };
        return changeOwnPassword(session.userId, currentPassword, newPassword);
    },

    changeUserName: async (newUsername) => {
        const session = get().session;
        if (!session) return { success: false, error: 'Not logged in' };
        const result = await changeUsername(session.userId, newUsername);
        if (result.success) {
            // Refresh session
            const newSession = await getCurrentSession();
            set({ session: newSession });
        }
        return result;
    },

    changeUserEmail: async (newEmail) => {
        const session = get().session;
        if (!session) return { success: false, error: 'Not logged in' };
        return changeEmail(session.userId, newEmail);
    },

    // User rockets
    fetchUserRockets: async () => {
        const session = get().session;
        if (!session) return [];
        return getUserRockets(session.userId);
    },

    saveRocket: async (name, description, data) => {
        const session = get().session;
        if (!session) return null;
        return saveUserRocket(session.userId, name, description, data);
    },

    updateRocket: async (rocketId, updates) => {
        return updateUserRocket(rocketId, updates);
    },

    removeRocket: async (rocketId) => {
        await deleteUserRocket(rocketId);
    },

    // Preferences
    loadPreferences: async () => {
        const session = get().session;
        if (!session) return;
        const prefs = await getUserPreferences(session.userId);
        set({ preferences: prefs });
    },

    updatePrefs: async (updates) => {
        const session = get().session;
        if (!session) return;
        const updated = await updateUserPreferences(session.userId, updates);
        set({ preferences: updated });
    },

    // Admin
    fetchUsers: () => getAllUsers(),
    adminUpdateUser: (userId, updates) => updateUser(userId, updates),
    adminResetPassword: (userId, newPassword) => resetUserPassword(userId, newPassword),
    adminDeleteUser: (userId) => deleteUser(userId),
    adminFetchAllSimulations: () => getAllSimulations(),
    adminDeleteSimulation: (simId) => deleteSimService(simId),
    adminFetchAllRockets: () => getAllRockets(),
    adminDeleteRocket: (rocketId) => deleteUserRocket(rocketId),

    // Device authorization
    checkAdminDeviceAuth: async () => {
        const isAuth = await isAuthorizedAdminDevice();
        set({ isAdminDeviceAuthorized: isAuth });
        return isAuth;
    },

    authorizeThisDevice: async () => {
        const fp = getDeviceFingerprint();
        await authorizeDevice(fp);
        set({ isAdminDeviceAuthorized: true });
    },

    revokeDevice: async () => {
        await revokeDeviceAuthorization();
        set({ isAdminDeviceAuthorized: false });
    },

    getDeviceFP: () => getDeviceFingerprint(),
}));
