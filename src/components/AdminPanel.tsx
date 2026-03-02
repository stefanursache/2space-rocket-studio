// ============================================================
// AdminPanel — Full-screen admin management overlay
// Device-locked: only accessible from the authorized device
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { StoredUser, UserSimulation, UserRocket, validatePassword } from '../services/authService';

type AdminTab = 'users' | 'simulations' | 'rockets' | 'device' | 'settings';

export const AdminPanel: React.FC = () => {
    const {
        showAdminPanel, setShowAdminPanel, session,
        fetchUsers, adminUpdateUser, adminResetPassword, adminDeleteUser,
        adminFetchAllSimulations, adminDeleteSimulation,
        adminFetchAllRockets, adminDeleteRocket,
        isAdminDeviceAuthorized, checkAdminDeviceAuth, authorizeThisDevice, revokeDevice, getDeviceFP,
    } = useAuthStore();

    const [activeTab, setActiveTab] = useState<AdminTab>('users');
    const [users, setUsers] = useState<StoredUser[]>([]);
    const [simulations, setSimulations] = useState<UserSimulation[]>([]);
    const [rockets, setRockets] = useState<UserRocket[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Password reset modal
    const [resetTarget, setResetTarget] = useState<StoredUser | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');

    // Search / filter
    const [userSearch, setUserSearch] = useState('');
    const [simSearch, setSimSearch] = useState('');
    const [rocketSearch, setRocketSearch] = useState('');

    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const u = await fetchUsers();
            setUsers(u);
        } catch { /* */ }
        setLoading(false);
    }, [fetchUsers]);

    const loadSimulations = useCallback(async () => {
        setLoading(true);
        try {
            const s = await adminFetchAllSimulations();
            setSimulations(s);
        } catch { /* */ }
        setLoading(false);
    }, [adminFetchAllSimulations]);

    const loadRockets = useCallback(async () => {
        try {
            const r = await adminFetchAllRockets();
            setRockets(r);
        } catch { /* */ }
    }, [adminFetchAllRockets]);

    useEffect(() => {
        if (showAdminPanel) {
            loadUsers();
            loadSimulations();
            loadRockets();
            checkAdminDeviceAuth();
        }
    }, [showAdminPanel, loadUsers, loadSimulations, loadRockets, checkAdminDeviceAuth]);

    if (!showAdminPanel || !session || session.role !== 'admin') return null;
    if (!isAdminDeviceAuthorized) {
        return (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdminPanel(false); }}>
                <div className="admin-panel" style={{ height: 'auto', maxHeight: '50vh' }}>
                    <div className="admin-header">
                        <div className="admin-header-left">
                            <span className="admin-icon">🔒</span>
                            <h2>Admin Access Denied</h2>
                        </div>
                        <button className="modal-close" onClick={() => setShowAdminPanel(false)}>✕</button>
                    </div>
                    <div className="admin-content" style={{ padding: '30px 24px', textAlign: 'center' }}>
                        <div className="device-lock-msg">
                            <p className="device-lock-icon">🛡️</p>
                            <h3>This device is not authorized</h3>
                            <p>The admin panel is locked to a specific device for security.</p>
                            <p className="device-fp-display">Your device ID: <code>{getDeviceFP()}</code></p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const flash = (text: string, type: 'success' | 'error') => {
        setActionMsg({ text, type });
        setTimeout(() => setActionMsg(null), 3500);
    };

    const handleToggleDisable = async (user: StoredUser) => {
        if (user.username === 'admin') { flash('Cannot disable the default admin', 'error'); return; }
        const res = await adminUpdateUser(user.id, { disabled: !user.disabled });
        if (res.success) {
            flash(`User "${user.username}" ${user.disabled ? 'enabled' : 'disabled'}`, 'success');
            loadUsers();
        } else flash(res.error || 'Failed', 'error');
    };

    const handleToggleRole = async (user: StoredUser) => {
        if (user.username === 'admin') { flash('Cannot change role of default admin', 'error'); return; }
        const newRole = user.role === 'admin' ? 'user' : 'admin';
        const res = await adminUpdateUser(user.id, { role: newRole });
        if (res.success) {
            flash(`User "${user.username}" is now ${newRole}`, 'success');
            loadUsers();
        } else flash(res.error || 'Failed', 'error');
    };

    const handleDeleteUser = async (user: StoredUser) => {
        if (user.username === 'admin') { flash('Cannot delete the default admin', 'error'); return; }
        if (!confirm(`Delete user "${user.username}" and all their data? This cannot be undone.`)) return;
        const res = await adminDeleteUser(user.id);
        if (res.success) {
            flash(`User "${user.username}" deleted`, 'success');
            loadUsers();
            loadSimulations();
        } else flash(res.error || 'Failed', 'error');
    };

    const handleResetPassword = async () => {
        if (!resetTarget) return;
        if (newPassword !== confirmNewPassword) { flash('Passwords do not match', 'error'); return; }
        const pErr = validatePassword(newPassword);
        if (pErr) { flash(pErr, 'error'); return; }
        const res = await adminResetPassword(resetTarget.id, newPassword);
        if (res.success) {
            flash(`Password reset for "${resetTarget.username}"`, 'success');
            setResetTarget(null); setNewPassword(''); setConfirmNewPassword('');
        } else flash(res.error || 'Failed', 'error');
    };

    const handleDeleteSim = async (sim: UserSimulation) => {
        if (!confirm(`Delete simulation "${sim.name}"?`)) return;
        await adminDeleteSimulation(sim.id);
        flash('Simulation deleted', 'success');
        loadSimulations();
        loadUsers();
    };

    const handleDeleteRocket = async (r: UserRocket) => {
        if (!confirm(`Delete rocket "${r.name}"?`)) return;
        await adminDeleteRocket(r.id);
        flash('Rocket deleted', 'success');
        loadRockets();
    };

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase())
    );

    const filteredSims = simulations.filter(s =>
        s.name.toLowerCase().includes(simSearch.toLowerCase()) ||
        s.rocketName.toLowerCase().includes(simSearch.toLowerCase()) ||
        users.find(u => u.id === s.userId)?.username.toLowerCase().includes(simSearch.toLowerCase()) || false
    );

    const filteredRockets = rockets.filter(r =>
        r.name.toLowerCase().includes(rocketSearch.toLowerCase()) ||
        r.description.toLowerCase().includes(rocketSearch.toLowerCase()) ||
        users.find(u => u.id === r.userId)?.username.toLowerCase().includes(rocketSearch.toLowerCase()) || false
    );

    const getUsernameById = (id: string) => users.find(u => u.id === id)?.username || 'Unknown';

    return (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdminPanel(false); }}>
            <div className="admin-panel">
                {/* Header */}
                <div className="admin-header">
                    <div className="admin-header-left">
                        <span className="admin-icon">⚙</span>
                        <h2>Admin Panel</h2>
                        <span className="admin-badge">Administrator</span>
                    </div>
                    <button className="modal-close" onClick={() => setShowAdminPanel(false)}>✕</button>
                </div>

                {/* Action message banner */}
                {actionMsg && (
                    <div className={`admin-flash ${actionMsg.type}`}>
                        {actionMsg.type === 'success' ? '✓' : '⚠'} {actionMsg.text}
                    </div>
                )}

                {/* Tabs */}
                <div className="admin-tabs">
                    <button className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                        👥 Users ({users.length})
                    </button>
                    <button className={`admin-tab ${activeTab === 'simulations' ? 'active' : ''}`} onClick={() => setActiveTab('simulations')}>
                        📊 Simulations ({simulations.length})
                    </button>
                    <button className={`admin-tab ${activeTab === 'rockets' ? 'active' : ''}`} onClick={() => setActiveTab('rockets')}>
                        🚀 Rockets ({rockets.length})
                    </button>
                    <button className={`admin-tab ${activeTab === 'device' ? 'active' : ''}`} onClick={() => setActiveTab('device')}>
                        🛡 Device Lock
                    </button>
                    <button className={`admin-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                        🔧 Info
                    </button>
                </div>

                {/* Content */}
                <div className="admin-content">
                    {loading && <div className="admin-loading">Loading…</div>}

                    {/* ---- USERS TAB ---- */}
                    {activeTab === 'users' && !loading && (
                        <div className="admin-section">
                            <div className="admin-toolbar">
                                <input
                                    className="admin-search"
                                    type="text"
                                    placeholder="Search users by name or email…"
                                    value={userSearch}
                                    onChange={e => setUserSearch(e.target.value)}
                                />
                                <button className="admin-btn-secondary" onClick={loadUsers}>↻ Refresh</button>
                            </div>
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Username</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Status</th>
                                            <th>Registered</th>
                                            <th>Last Login</th>
                                            <th>Sims</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map(user => (
                                            <tr key={user.id} className={user.disabled ? 'row-disabled' : ''}>
                                                <td className="td-username">
                                                    {user.username}
                                                    {user.username === 'admin' && <span className="badge-default">default</span>}
                                                </td>
                                                <td className="td-email">{user.email}</td>
                                                <td>
                                                    <span className={`role-badge ${user.role}`}>
                                                        {user.role}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`status-badge ${user.disabled ? 'disabled' : 'active'}`}>
                                                        {user.disabled ? 'Disabled' : 'Active'}
                                                    </span>
                                                </td>
                                                <td className="td-date">{new Date(user.createdAt).toLocaleDateString()}</td>
                                                <td className="td-date">
                                                    {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : '—'}
                                                </td>
                                                <td className="td-count">{user.simulationCount}</td>
                                                <td className="td-actions">
                                                    <button className="action-btn" onClick={() => handleToggleRole(user)} title="Toggle role">
                                                        {user.role === 'admin' ? '👤' : '⭐'}
                                                    </button>
                                                    <button className="action-btn" onClick={() => handleToggleDisable(user)} title={user.disabled ? 'Enable' : 'Disable'}>
                                                        {user.disabled ? '✅' : '🚫'}
                                                    </button>
                                                    <button className="action-btn" onClick={() => { setResetTarget(user); setNewPassword(''); setConfirmNewPassword(''); }} title="Reset password">
                                                        🔑
                                                    </button>
                                                    <button className="action-btn danger" onClick={() => handleDeleteUser(user)} title="Delete user">
                                                        🗑
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredUsers.length === 0 && (
                                            <tr><td colSpan={8} className="td-empty">No users found</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ---- SIMULATIONS TAB ---- */}
                    {activeTab === 'simulations' && !loading && (
                        <div className="admin-section">
                            <div className="admin-toolbar">
                                <input
                                    className="admin-search"
                                    type="text"
                                    placeholder="Search simulations…"
                                    value={simSearch}
                                    onChange={e => setSimSearch(e.target.value)}
                                />
                                <button className="admin-btn-secondary" onClick={loadSimulations}>↻ Refresh</button>
                            </div>
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Rocket</th>
                                            <th>Owner</th>
                                            <th>Created</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSims.map(sim => (
                                            <tr key={sim.id}>
                                                <td>{sim.name}</td>
                                                <td>{sim.rocketName}</td>
                                                <td className="td-username">{getUsernameById(sim.userId)}</td>
                                                <td className="td-date">{new Date(sim.createdAt).toLocaleString()}</td>
                                                <td className="td-actions">
                                                    <button className="action-btn danger" onClick={() => handleDeleteSim(sim)} title="Delete simulation">
                                                        🗑
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredSims.length === 0 && (
                                            <tr><td colSpan={5} className="td-empty">No simulations found</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ---- INFO TAB ---- */}
                    {activeTab === 'settings' && !loading && (
                        <div className="admin-section admin-info">
                            <div className="info-card">
                                <h3>🔒 Security Info</h3>
                                <ul>
                                    <li>Passwords hashed with <strong>PBKDF2-SHA256</strong> (100,000 iterations)</li>
                                    <li>16-byte random salt per user (Web Crypto API)</li>
                                    <li>Sessions expire after <strong>24 hours</strong></li>
                                    <li>Session tokens: 256-bit cryptographically random</li>
                                    <li>All data stored in <strong>IndexedDB</strong> (client-side)</li>
                                    <li>Admin panel is <strong>device-locked</strong> to this machine</li>
                                </ul>
                            </div>
                            <div className="info-card">
                                <h3>📊 Statistics</h3>
                                <div className="stats-grid">
                                    <div className="stat-item">
                                        <span className="stat-value">{users.length}</span>
                                        <span className="stat-label">Total Users</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-value">{users.filter(u => u.role === 'admin').length}</span>
                                        <span className="stat-label">Admins</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-value">{users.filter(u => !u.disabled).length}</span>
                                        <span className="stat-label">Active</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-value">{simulations.length}</span>
                                        <span className="stat-label">Simulations</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-value">{rockets.length}</span>
                                        <span className="stat-label">Saved Rockets</span>
                                    </div>
                                </div>
                            </div>
                            <div className="info-card">
                                <h3>🔑 Default Admin Credentials</h3>
                                <p className="info-creds">
                                    Username: <code>admin</code> &nbsp;|&nbsp; Password: <code>Admin123!</code>
                                </p>
                                <p className="info-warning">⚠ Change this password immediately after first login!</p>
                            </div>
                        </div>
                    )}

                    {/* ---- ROCKETS TAB ---- */}
                    {activeTab === 'rockets' && !loading && (
                        <div className="admin-section">
                            <div className="admin-toolbar">
                                <input
                                    className="admin-search"
                                    type="text"
                                    placeholder="Search rockets…"
                                    value={rocketSearch}
                                    onChange={e => setRocketSearch(e.target.value)}
                                />
                                <button className="admin-btn-secondary" onClick={loadRockets}>↻ Refresh</button>
                            </div>
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Description</th>
                                            <th>Owner</th>
                                            <th>Created</th>
                                            <th>Updated</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRockets.map(r => (
                                            <tr key={r.id}>
                                                <td className="td-username">{r.name}</td>
                                                <td className="td-email">{r.description || '—'}</td>
                                                <td className="td-username">{getUsernameById(r.userId)}</td>
                                                <td className="td-date">{new Date(r.createdAt).toLocaleDateString()}</td>
                                                <td className="td-date">{new Date(r.updatedAt).toLocaleDateString()}</td>
                                                <td className="td-actions">
                                                    <button className="action-btn danger" onClick={() => handleDeleteRocket(r)} title="Delete rocket">
                                                        🗑
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredRockets.length === 0 && (
                                            <tr><td colSpan={6} className="td-empty">No rockets found</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ---- DEVICE LOCK TAB ---- */}
                    {activeTab === 'device' && !loading && (
                        <div className="admin-section admin-info">
                            <div className="info-card">
                                <h3>🛡 Device Authorization</h3>
                                <p>The admin panel is locked to a single device for security. Only the authorized device can access admin features.</p>
                                <div className="device-info-grid">
                                    <div className="device-info-item">
                                        <span className="device-info-label">Current Device ID:</span>
                                        <code className="device-fp-code">{getDeviceFP()}</code>
                                    </div>
                                    <div className="device-info-item">
                                        <span className="device-info-label">Status:</span>
                                        <span className="status-badge active">✓ Authorized</span>
                                    </div>
                                </div>
                            </div>
                            <div className="info-card">
                                <h3>⚠ Device Management</h3>
                                <p>If you need to move admin access to a different device, revoke the current authorization first, then log in as admin on the new device.</p>
                                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                                    <button className="auth-submit" style={{ background: '#e06c75', flex: 'unset', padding: '10px 20px' }} onClick={async () => {
                                        if (!confirm('Revoke device authorization? You will need to re-authorize on next admin login.')) return;
                                        await revokeDevice();
                                        flash('Device authorization revoked', 'success');
                                    }}>
                                        Revoke This Device
                                    </button>
                                    <button className="admin-btn-secondary" style={{ flex: 'unset', padding: '10px 20px' }} onClick={async () => {
                                        await authorizeThisDevice();
                                        flash('This device has been re-authorized', 'success');
                                    }}>
                                        Re-Authorize This Device
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ---- PASSWORD RESET MODAL ---- */}
                {resetTarget && (
                    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setResetTarget(null); }}>
                        <div className="reset-modal">
                            <div className="modal-header">
                                <h2>Reset Password — {resetTarget.username}</h2>
                                <button className="modal-close" onClick={() => setResetTarget(null)}>✕</button>
                            </div>
                            <div className="reset-body">
                                <div className="auth-field">
                                    <label>New Password</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Min 8 chars, upper+lower+number+special"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="auth-field">
                                    <label>Confirm New Password</label>
                                    <input
                                        type="password"
                                        value={confirmNewPassword}
                                        onChange={e => setConfirmNewPassword(e.target.value)}
                                        placeholder="Re-enter new password"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="reset-actions">
                                    <button className="admin-btn-secondary" onClick={() => setResetTarget(null)}>Cancel</button>
                                    <button className="auth-submit" onClick={handleResetPassword}>
                                        Reset Password
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
