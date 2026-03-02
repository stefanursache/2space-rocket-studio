// ============================================================
// UserRockets — Panel showing user's saved rocket designs
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useStore } from '../store/useStore';
import { UserRocket } from '../services/authService';

export const UserRockets: React.FC = () => {
    const { showUserRockets, setShowUserRockets, session, fetchUserRockets, saveRocket, removeRocket } = useAuthStore();
    const { rocket, setRocket } = useStore();

    const [rockets, setRockets] = useState<UserRocket[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [flash, setFlash] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Save dialog
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saveDesc, setSaveDesc] = useState('');

    const [search, setSearch] = useState('');

    const loadRockets = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetchUserRockets();
            setRockets(r.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
        } catch { /* */ }
        setLoading(false);
    }, [fetchUserRockets]);

    useEffect(() => {
        if (showUserRockets && session) {
            loadRockets();
        }
    }, [showUserRockets, session, loadRockets]);

    if (!showUserRockets || !session) return null;

    const showFlash = (text: string, type: 'success' | 'error') => {
        setFlash({ text, type });
        setTimeout(() => setFlash(null), 3000);
    };

    const handleSave = async () => {
        if (!saveName.trim()) { showFlash('Please enter a name', 'error'); return; }
        setSaving(true);
        try {
            const data = JSON.stringify(rocket);
            await saveRocket(saveName.trim(), saveDesc.trim(), data);
            showFlash(`"${saveName.trim()}" saved!`, 'success');
            setShowSaveDialog(false);
            setSaveName('');
            setSaveDesc('');
            loadRockets();
        } catch {
            showFlash('Failed to save rocket', 'error');
        }
        setSaving(false);
    };

    const handleLoad = (r: UserRocket) => {
        try {
            const rocketData = JSON.parse(r.data);
            setRocket(rocketData);
            showFlash(`Loaded "${r.name}"`, 'success');
        } catch {
            showFlash('Failed to load rocket data', 'error');
        }
    };

    const handleDelete = async (r: UserRocket) => {
        if (!confirm(`Delete "${r.name}"? This cannot be undone.`)) return;
        await removeRocket(r.id);
        showFlash(`"${r.name}" deleted`, 'success');
        loadRockets();
    };

    const filtered = rockets.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.description.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowUserRockets(false); }}>
            <div className="user-rockets-panel">
                {/* Header */}
                <div className="ur-header">
                    <div className="ur-header-left">
                        <span className="ur-icon">🚀</span>
                        <h2>My Rockets</h2>
                        <span className="ur-count">{rockets.length} designs</span>
                    </div>
                    <button className="modal-close" onClick={() => setShowUserRockets(false)}>✕</button>
                </div>

                {flash && (
                    <div className={`admin-flash ${flash.type}`}>
                        {flash.type === 'success' ? '✓' : '⚠'} {flash.text}
                    </div>
                )}

                {/* Toolbar */}
                <div className="ur-toolbar">
                    <input
                        className="admin-search"
                        type="text"
                        placeholder="Search your rockets…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <button className="ur-save-btn" onClick={() => { setShowSaveDialog(true); setSaveName(rocket.name); setSaveDesc(''); }}>
                        💾 Save Current Design
                    </button>
                </div>

                {/* Rocket grid */}
                <div className="ur-content">
                    {loading && <div className="admin-loading">Loading your rockets…</div>}
                    {!loading && filtered.length === 0 && (
                        <div className="ur-empty">
                            <span className="ur-empty-icon">🚀</span>
                            <p>No saved rockets yet</p>
                            <p className="ur-empty-hint">Click "Save Current Design" to save your first rocket!</p>
                        </div>
                    )}
                    {!loading && filtered.length > 0 && (
                        <div className="ur-grid">
                            {filtered.map(r => (
                                <div key={r.id} className="ur-card">
                                    <div className="ur-card-header">
                                        <span className="ur-card-icon">🚀</span>
                                        <div className="ur-card-info">
                                            <h3>{r.name}</h3>
                                            {r.description && <p className="ur-card-desc">{r.description}</p>}
                                        </div>
                                    </div>
                                    <div className="ur-card-meta">
                                        <span className="ur-card-date">
                                            Created: {new Date(r.createdAt).toLocaleDateString()}
                                        </span>
                                        <span className="ur-card-date">
                                            Updated: {new Date(r.updatedAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="ur-card-actions">
                                        <button className="ur-load-btn" onClick={() => handleLoad(r)} title="Load this rocket">
                                            📂 Load
                                        </button>
                                        <button className="action-btn danger" onClick={() => handleDelete(r)} title="Delete">
                                            🗑
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Save dialog overlay */}
                {showSaveDialog && (
                    <div className="reset-modal" onClick={e => { if (e.target === e.currentTarget) setShowSaveDialog(false); }}>
                        <div className="reset-body">
                            <h3>💾 Save Rocket Design</h3>
                            <div className="auth-field">
                                <label>Rocket Name</label>
                                <input
                                    type="text"
                                    value={saveName}
                                    onChange={e => setSaveName(e.target.value)}
                                    placeholder="My Awesome Rocket"
                                    autoFocus
                                />
                            </div>
                            <div className="auth-field">
                                <label>Description (optional)</label>
                                <input
                                    type="text"
                                    value={saveDesc}
                                    onChange={e => setSaveDesc(e.target.value)}
                                    placeholder="Notes about this design…"
                                />
                            </div>
                            <div className="reset-actions">
                                <button className="admin-btn-secondary" onClick={() => setShowSaveDialog(false)}>Cancel</button>
                                <button className="auth-submit" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
