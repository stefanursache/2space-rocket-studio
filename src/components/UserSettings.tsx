// ============================================================
// UserSettings — Account settings panel
// ============================================================

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { validatePassword, validateUsername, validateEmail, getUserById, StoredUser } from '../services/authService';

type SettingsTab = 'profile' | 'security' | 'appearance';

export const UserSettings: React.FC = () => {
    const {
        showUserSettings, setShowUserSettings, session, preferences,
        changePassword, changeUserName, changeUserEmail, updatePrefs, loadPreferences,
    } = useAuthStore();

    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const [flash, setFlash] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [userInfo, setUserInfo] = useState<StoredUser | null>(null);

    // Profile fields
    const [newUsername, setNewUsername] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);

    // Password fields
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwSaving, setPwSaving] = useState(false);

    // Appearance
    const [btnColor, setBtnColor] = useState('#3b8eed');

    useEffect(() => {
        if (showUserSettings && session) {
            setNewUsername(session.username);
            loadPreferences();
            // Load full user info
            getUserById(session.userId).then(u => {
                if (u) {
                    setUserInfo(u);
                    setNewEmail(u.email);
                }
            });
        }
    }, [showUserSettings, session]);

    useEffect(() => {
        if (preferences) {
            setBtnColor(preferences.loginButtonColor);
        }
    }, [preferences]);

    if (!showUserSettings || !session) return null;

    const showFlash = (text: string, type: 'success' | 'error') => {
        setFlash({ text, type });
        setTimeout(() => setFlash(null), 3500);
    };

    const handleSaveProfile = async () => {
        setProfileSaving(true);
        let changed = false;

        // Username change
        if (newUsername.trim() !== session.username) {
            const uErr = validateUsername(newUsername.trim());
            if (uErr) { showFlash(uErr, 'error'); setProfileSaving(false); return; }
            const res = await changeUserName(newUsername.trim());
            if (!res.success) { showFlash(res.error || 'Failed to change username', 'error'); setProfileSaving(false); return; }
            changed = true;
        }

        // Email change
        if (userInfo && newEmail.trim() !== userInfo.email) {
            const eErr = validateEmail(newEmail.trim());
            if (eErr) { showFlash(eErr, 'error'); setProfileSaving(false); return; }
            const res = await changeUserEmail(newEmail.trim());
            if (!res.success) { showFlash(res.error || 'Failed to change email', 'error'); setProfileSaving(false); return; }
            changed = true;
        }

        if (changed) {
            showFlash('Profile updated successfully!', 'success');
            // Refresh user info
            const u = await getUserById(session.userId);
            if (u) setUserInfo(u);
        } else {
            showFlash('No changes to save', 'error');
        }
        setProfileSaving(false);
    };

    const handleChangePassword = async () => {
        if (!currentPw) { showFlash('Enter your current password', 'error'); return; }
        const pErr = validatePassword(newPw);
        if (pErr) { showFlash(pErr, 'error'); return; }
        if (newPw !== confirmPw) { showFlash('Passwords do not match', 'error'); return; }

        setPwSaving(true);
        const res = await changePassword(currentPw, newPw);
        if (res.success) {
            showFlash('Password changed successfully!', 'success');
            setCurrentPw(''); setNewPw(''); setConfirmPw('');
        } else {
            showFlash(res.error || 'Failed to change password', 'error');
        }
        setPwSaving(false);
    };

    const handleColorChange = async (color: string) => {
        setBtnColor(color);
        await updatePrefs({ loginButtonColor: color });
    };

    const presetColors = [
        '#3b8eed', '#e06c75', '#e5c07b', '#98c379',
        '#c678dd', '#56b6c2', '#d19a66', '#ff6b6b',
        '#48dbfb', '#ff9ff3', '#feca57', '#54a0ff',
    ];

    return (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowUserSettings(false); }}>
            <div className="user-settings-panel">
                {/* Header */}
                <div className="us-header">
                    <div className="us-header-left">
                        <span className="us-icon">⚙</span>
                        <h2>Account Settings</h2>
                    </div>
                    <button className="modal-close" onClick={() => setShowUserSettings(false)}>✕</button>
                </div>

                {flash && (
                    <div className={`admin-flash ${flash.type}`}>
                        {flash.type === 'success' ? '✓' : '⚠'} {flash.text}
                    </div>
                )}

                {/* Tabs */}
                <div className="admin-tabs">
                    <button className={`admin-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                        👤 Profile
                    </button>
                    <button className={`admin-tab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
                        🔒 Security
                    </button>
                    <button className={`admin-tab ${activeTab === 'appearance' ? 'active' : ''}`} onClick={() => setActiveTab('appearance')}>
                        🎨 Appearance
                    </button>
                </div>

                <div className="us-content">
                    {/* ---- PROFILE TAB ---- */}
                    {activeTab === 'profile' && (
                        <div className="us-section">
                            <div className="us-profile-card">
                                <div className="us-avatar-large">
                                    {session.username[0].toUpperCase()}
                                </div>
                                <div className="us-profile-info">
                                    <h3>{session.username}</h3>
                                    <span className={`role-badge ${session.role}`}>{session.role}</span>
                                    {userInfo && (
                                        <span className="us-member-since">
                                            Member since {new Date(userInfo.createdAt).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="us-form">
                                <div className="auth-field">
                                    <label>Username</label>
                                    <input
                                        type="text"
                                        value={newUsername}
                                        onChange={e => setNewUsername(e.target.value)}
                                        placeholder="Your username"
                                    />
                                </div>
                                <div className="auth-field">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        placeholder="your@email.com"
                                    />
                                </div>
                                <button className="auth-submit" onClick={handleSaveProfile} disabled={profileSaving}>
                                    {profileSaving ? 'Saving…' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ---- SECURITY TAB ---- */}
                    {activeTab === 'security' && (
                        <div className="us-section">
                            <div className="info-card">
                                <h4>🔑 Change Password</h4>
                                <div className="us-form">
                                    <div className="auth-field">
                                        <label>Current Password</label>
                                        <input
                                            type="password"
                                            value={currentPw}
                                            onChange={e => setCurrentPw(e.target.value)}
                                            placeholder="Enter current password"
                                            autoComplete="current-password"
                                        />
                                    </div>
                                    <div className="auth-field">
                                        <label>New Password</label>
                                        <input
                                            type="password"
                                            value={newPw}
                                            onChange={e => setNewPw(e.target.value)}
                                            placeholder="Min 8 chars, upper+lower+number+special"
                                            autoComplete="new-password"
                                        />
                                    </div>
                                    <div className="auth-field">
                                        <label>Confirm New Password</label>
                                        <input
                                            type="password"
                                            value={confirmPw}
                                            onChange={e => setConfirmPw(e.target.value)}
                                            placeholder="Re-enter new password"
                                            autoComplete="new-password"
                                        />
                                    </div>
                                    <button className="auth-submit" onClick={handleChangePassword} disabled={pwSaving}>
                                        {pwSaving ? 'Changing…' : 'Change Password'}
                                    </button>
                                </div>
                            </div>

                            <div className="info-card" style={{ marginTop: 16 }}>
                                <h4>🛡 Session Info</h4>
                                <p>Session expires: <strong>{new Date(session.expiresAt).toLocaleString()}</strong></p>
                                <p>Role: <span className={`role-badge ${session.role}`}>{session.role}</span></p>
                            </div>
                        </div>
                    )}

                    {/* ---- APPEARANCE TAB ---- */}
                    {activeTab === 'appearance' && (
                        <div className="us-section">
                            <div className="info-card">
                                <h4>🎨 Login Button Color</h4>
                                <p className="us-color-hint">Choose a custom color for the Login / Register button</p>
                                <div className="us-color-presets">
                                    {presetColors.map(c => (
                                        <button
                                            key={c}
                                            className={`us-color-swatch ${btnColor === c ? 'active' : ''}`}
                                            style={{ background: c }}
                                            onClick={() => handleColorChange(c)}
                                            title={c}
                                        />
                                    ))}
                                </div>
                                <div className="us-color-custom">
                                    <label>Custom color:</label>
                                    <input
                                        type="color"
                                        value={btnColor}
                                        onChange={e => handleColorChange(e.target.value)}
                                        className="us-color-picker"
                                    />
                                    <span className="us-color-hex">{btnColor}</span>
                                </div>
                                <div className="us-color-preview">
                                    <span className="us-preview-label">Preview:</span>
                                    <button
                                        className="toolbar-btn"
                                        style={{ background: btnColor, borderColor: btnColor, color: '#fff', pointerEvents: 'none' }}
                                    >
                                        <span className="btn-icon">👤</span>
                                        <span className="btn-label">Login / Register</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
