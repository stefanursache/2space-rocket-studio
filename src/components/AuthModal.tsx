// ============================================================
// AuthModal — Login / Register popup
// ============================================================

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { validateUsername, validateEmail, validatePassword } from '../services/authService';

type AuthTab = 'login' | 'register';

export const AuthModal: React.FC = () => {
    const { showAuthModal, setShowAuthModal, login, register, authError, clearError, isLoading } = useAuthStore();
    const [tab, setTab] = useState<AuthTab>('login');
    const [submitting, setSubmitting] = useState(false);

    // Login fields
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    // Register fields
    const [regUsername, setRegUsername] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regConfirm, setRegConfirm] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!showAuthModal) {
            setLoginUsername(''); setLoginPassword('');
            setRegUsername(''); setRegEmail(''); setRegPassword(''); setRegConfirm('');
            setFieldErrors({});
            setSubmitting(false);
        }
    }, [showAuthModal]);

    useEffect(() => { clearError(); setFieldErrors({}); }, [tab]);

    if (!showAuthModal) return null;

    const switchTab = (t: AuthTab) => { setTab(t); clearError(); };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        const errs: Record<string, string> = {};
        if (!loginUsername.trim()) errs.loginUsername = 'Username is required';
        if (!loginPassword) errs.loginPassword = 'Password is required';
        if (Object.keys(errs).length) { setFieldErrors(errs); return; }

        setFieldErrors({});
        setSubmitting(true);
        await login(loginUsername.trim(), loginPassword);
        setSubmitting(false);
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        const errs: Record<string, string> = {};
        const uErr = validateUsername(regUsername.trim());
        if (uErr) errs.regUsername = uErr;
        const eErr = validateEmail(regEmail.trim());
        if (eErr) errs.regEmail = eErr;
        const pErr = validatePassword(regPassword);
        if (pErr) errs.regPassword = pErr;
        if (regPassword !== regConfirm) errs.regConfirm = 'Passwords do not match';
        if (!regConfirm) errs.regConfirm = 'Please confirm your password';

        if (Object.keys(errs).length) { setFieldErrors(errs); return; }

        setFieldErrors({});
        setSubmitting(true);
        await register(regUsername.trim(), regEmail.trim(), regPassword);
        setSubmitting(false);
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) setShowAuthModal(false);
    };

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div className="auth-modal">
                <div className="auth-modal-header">
                    <div className="auth-tabs">
                        <button
                            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
                            onClick={() => switchTab('login')}
                        >
                            Sign In
                        </button>
                        <button
                            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
                            onClick={() => switchTab('register')}
                        >
                            Register
                        </button>
                    </div>
                    <button className="modal-close" onClick={() => setShowAuthModal(false)}>✕</button>
                </div>

                <div className="auth-modal-body">
                    {authError && (
                        <div className="auth-error">
                            <span className="auth-error-icon">⚠</span>
                            {authError}
                        </div>
                    )}

                    {tab === 'login' ? (
                        <form onSubmit={handleLogin} className="auth-form" autoComplete="off">
                            <div className="auth-field">
                                <label>Username</label>
                                <input
                                    type="text"
                                    value={loginUsername}
                                    onChange={e => setLoginUsername(e.target.value)}
                                    placeholder="Enter username"
                                    autoFocus
                                    autoComplete="username"
                                    spellCheck={false}
                                />
                                {fieldErrors.loginUsername && <span className="field-error">{fieldErrors.loginUsername}</span>}
                            </div>
                            <div className="auth-field">
                                <label>Password</label>
                                <input
                                    type="password"
                                    value={loginPassword}
                                    onChange={e => setLoginPassword(e.target.value)}
                                    placeholder="Enter password"
                                    autoComplete="current-password"
                                />
                                {fieldErrors.loginPassword && <span className="field-error">{fieldErrors.loginPassword}</span>}
                            </div>
                            <button type="submit" className="auth-submit" disabled={submitting}>
                                {submitting ? 'Signing in…' : 'Sign In'}
                            </button>
                            <p className="auth-switch">
                                Don't have an account?{' '}
                                <button type="button" className="auth-link" onClick={() => switchTab('register')}>
                                    Register here
                                </button>
                            </p>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister} className="auth-form" autoComplete="off">
                            <div className="auth-field">
                                <label>Username</label>
                                <input
                                    type="text"
                                    value={regUsername}
                                    onChange={e => setRegUsername(e.target.value)}
                                    placeholder="3-30 chars, letters/numbers/-/_"
                                    autoFocus
                                    autoComplete="username"
                                    spellCheck={false}
                                />
                                {fieldErrors.regUsername && <span className="field-error">{fieldErrors.regUsername}</span>}
                            </div>
                            <div className="auth-field">
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={regEmail}
                                    onChange={e => setRegEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                />
                                {fieldErrors.regEmail && <span className="field-error">{fieldErrors.regEmail}</span>}
                            </div>
                            <div className="auth-field">
                                <label>Password</label>
                                <input
                                    type="password"
                                    value={regPassword}
                                    onChange={e => setRegPassword(e.target.value)}
                                    placeholder="Min 8 chars, upper+lower+number+special"
                                    autoComplete="new-password"
                                />
                                {fieldErrors.regPassword && <span className="field-error">{fieldErrors.regPassword}</span>}
                                <PasswordStrength password={regPassword} />
                            </div>
                            <div className="auth-field">
                                <label>Confirm Password</label>
                                <input
                                    type="password"
                                    value={regConfirm}
                                    onChange={e => setRegConfirm(e.target.value)}
                                    placeholder="Re-enter password"
                                    autoComplete="new-password"
                                />
                                {fieldErrors.regConfirm && <span className="field-error">{fieldErrors.regConfirm}</span>}
                            </div>
                            <button type="submit" className="auth-submit" disabled={submitting}>
                                {submitting ? 'Creating account…' : 'Create Account'}
                            </button>
                            <p className="auth-switch">
                                Already have an account?{' '}
                                <button type="button" className="auth-link" onClick={() => switchTab('login')}>
                                    Sign in here
                                </button>
                            </p>
                        </form>
                    )}
                </div>

                <div className="auth-modal-footer">
                    <span className="auth-footer-icon">🔒</span>
                    <span>Passwords are hashed with PBKDF2-SHA256 (100k iterations)</span>
                </div>
            </div>
        </div>
    );
};

/* ---------- Password strength indicator ---------- */
const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
    if (!password) return null;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60', '#1abc9c'];
    const idx = Math.min(score, labels.length - 1);
    const pct = ((score) / 6) * 100;

    return (
        <div className="password-strength">
            <div className="strength-bar">
                <div className="strength-fill" style={{ width: `${pct}%`, background: colors[idx] }} />
            </div>
            <span className="strength-label" style={{ color: colors[idx] }}>{labels[idx]}</span>
        </div>
    );
};
