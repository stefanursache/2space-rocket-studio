// ============================================================
// WorkspaceDashboard — Collaborative workspace hub
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useStore } from '../store/useStore';
import {
    WorkspaceInfo, MemberPermission, UserRocket,
    getWorkspaces, createWorkspace, deleteWorkspace, updateWorkspace,
    addWorkspaceMember, updateMemberPermission, removeWorkspaceMember,
    getWorkspaceRocket, updateWorkspaceRocket, getUserRockets,
} from '../services/authService';

const PERM_LABELS: Record<MemberPermission, string> = {
    'readonly': '👁 Read Only',
    'read-write': '✏️ Read & Write',
    'download': '⬇️ Download',
};

const PERM_COLORS: Record<MemberPermission, string> = {
    'readonly': '#888',
    'read-write': '#4caf50',
    'download': '#ff9800',
};

export const WorkspaceDashboard: React.FC = () => {
    const { session } = useAuthStore();
    const { showWorkspaces, setShowWorkspaces } = useAuthStore();
    const { rocket, setRocket } = useStore();

    // ── State ──────────────────────────────────────────────
    const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [flash, setFlash] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Create dialog
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createDesc, setCreateDesc] = useState('');
    const [createRocketId, setCreateRocketId] = useState('');
    const [myRockets, setMyRockets] = useState<UserRocket[]>([]);
    const [creating, setCreating] = useState(false);

    // Active workspace view
    const [activeWs, setActiveWs] = useState<WorkspaceInfo | null>(null);
    const [activePermission, setActivePermission] = useState<MemberPermission>('readonly');

    // Add member dialog
    const [showAddMember, setShowAddMember] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [invitePerm, setInvitePerm] = useState<MemberPermission>('readonly');
    const [inviting, setInviting] = useState(false);

    // Edit workspace dialog
    const [showEditWs, setShowEditWs] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');

    // ── Helpers ─────────────────────────────────────────────
    const showFlash = (text: string, type: 'success' | 'error') => {
        setFlash({ text, type });
        setTimeout(() => setFlash(null), 3000);
    };

    const loadWorkspaces = useCallback(async () => {
        setLoading(true);
        try {
            const ws = await getWorkspaces();
            setWorkspaces(ws);
        } catch { showFlash('Failed to load workspaces', 'error'); }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (showWorkspaces && session) {
            loadWorkspaces();
        }
    }, [showWorkspaces, session, loadWorkspaces]);

    if (!showWorkspaces || !session) return null;

    const isOwner = (ws: WorkspaceInfo) => ws.ownerId === session.userId;

    const getMyPermission = (ws: WorkspaceInfo): MemberPermission => {
        if (isOwner(ws)) return 'read-write';
        const m = ws.members.find(m => m.userId === session.userId);
        return m?.permission || 'readonly';
    };

    // ── Handlers ────────────────────────────────────────────
    const handleCreateOpen = async () => {
        setShowCreate(true);
        setCreateName('');
        setCreateDesc('');
        setCreateRocketId('');
        try {
            const rockets = await getUserRockets(session.userId);
            setMyRockets(rockets);
        } catch { /* */ }
    };

    const handleCreate = async () => {
        if (!createName.trim()) { showFlash('Name is required', 'error'); return; }
        setCreating(true);
        const result = await createWorkspace(createName, createRocketId || undefined, createDesc);
        if (result.success) {
            showFlash('Workspace created!', 'success');
            setShowCreate(false);
            loadWorkspaces();
        } else {
            showFlash(result.error || 'Failed', 'error');
        }
        setCreating(false);
    };

    const handleDelete = async (ws: WorkspaceInfo) => {
        if (!confirm(`Delete workspace "${ws.name}"? Members will lose access.`)) return;
        const result = await deleteWorkspace(ws.id);
        if (result.success) {
            showFlash('Workspace deleted', 'success');
            if (activeWs?.id === ws.id) setActiveWs(null);
            loadWorkspaces();
        } else {
            showFlash(result.error || 'Failed', 'error');
        }
    };

    const handleLeave = async (ws: WorkspaceInfo) => {
        if (!confirm(`Leave workspace "${ws.name}"?`)) return;
        await removeWorkspaceMember(ws.id, session.userId);
        showFlash('Left workspace', 'success');
        if (activeWs?.id === ws.id) setActiveWs(null);
        loadWorkspaces();
    };

    const handleOpenWorkspace = async (ws: WorkspaceInfo) => {
        try {
            // If no rocket linked, just open the workspace with computed permission
            if (!ws.rocketId) {
                setActiveWs(ws);
                setActivePermission(getMyPermission(ws));
                return;
            }
            const result = await getWorkspaceRocket(ws.id);
            setActiveWs(ws);
            setActivePermission(result.permission);
        } catch {
            // Still open the workspace even if rocket fetch fails
            setActiveWs(ws);
            setActivePermission(getMyPermission(ws));
        }
    };

    const handleLoadRocket = async () => {
        if (!activeWs) return;
        try {
            const result = await getWorkspaceRocket(activeWs.id);
            if (result.rocket.data) {
                const rocketData = JSON.parse(result.rocket.data);
                setRocket(rocketData);
                showFlash(`Loaded "${result.rocket.name}" from workspace`, 'success');
            } else {
                showFlash('Rocket has no data yet', 'error');
            }
        } catch {
            showFlash('Failed to load rocket', 'error');
        }
    };

    const handleSaveToWorkspace = async () => {
        if (!activeWs) return;
        if (activePermission !== 'read-write') {
            showFlash('You don\'t have write access', 'error');
            return;
        }
        try {
            const data = JSON.stringify(rocket);
            // Check data size client-side (1 MB limit)
            if (data.length > 1_048_576) {
                showFlash('Rocket data too large (max 1 MB). Simplify the design.', 'error');
                return;
            }
            const result = await updateWorkspaceRocket(activeWs.id, {
                name: rocket.name,
                data,
            });
            if (result.success) {
                showFlash(activeWs.rocketId ? 'Rocket updated in workspace!' : 'Rocket saved to workspace!', 'success');
                // Refresh workspace to get latest rocketName / rocketId
                const refreshed = await getWorkspaces();
                setWorkspaces(refreshed);
                const updated = refreshed.find(w => w.id === activeWs.id);
                if (updated) setActiveWs(updated);
            } else {
                showFlash(result.error || 'Failed to save', 'error');
            }
        } catch {
            showFlash('Failed to save', 'error');
        }
    };

    const handleInvite = async () => {
        if (!activeWs || !inviteEmail.trim()) return;
        setInviting(true);
        const result = await addWorkspaceMember(activeWs.id, inviteEmail.trim(), invitePerm);
        if (result.success && result.workspace) {
            setActiveWs(result.workspace);
            showFlash('Member added!', 'success');
            setShowAddMember(false);
            setInviteEmail('');
            loadWorkspaces();
        } else {
            showFlash(result.error || 'Failed to add member', 'error');
        }
        setInviting(false);
    };

    const handlePermChange = async (userId: string, perm: MemberPermission) => {
        if (!activeWs) return;
        const result = await updateMemberPermission(activeWs.id, userId, perm);
        if (result.success && result.workspace) {
            setActiveWs(result.workspace);
            showFlash('Permission updated', 'success');
        } else {
            showFlash(result.error || 'Failed', 'error');
        }
    };

    const handleRemoveMember = async (userId: string, username: string) => {
        if (!activeWs) return;
        if (!confirm(`Remove ${username} from this workspace?`)) return;
        await removeWorkspaceMember(activeWs.id, userId);
        const refreshed = await getWorkspaces();
        setWorkspaces(refreshed);
        const updated = refreshed.find(w => w.id === activeWs.id);
        if (updated) setActiveWs(updated);
        showFlash(`${username} removed`, 'success');
    };

    const handleEditWs = async () => {
        if (!activeWs) return;
        const result = await updateWorkspace(activeWs.id, { name: editName, description: editDesc });
        if (result.success && result.workspace) {
            setActiveWs(result.workspace);
            setShowEditWs(false);
            showFlash('Workspace updated', 'success');
            loadWorkspaces();
        } else {
            showFlash(result.error || 'Failed', 'error');
        }
    };

    // ── Render ──────────────────────────────────────────────
    return (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowWorkspaces(false); setActiveWs(null); } }}>
            <div className="ws-panel">
                {/* Header */}
                <div className="ws-header">
                    <div className="ws-header-left">
                        {activeWs ? (
                            <button className="ws-back-btn" onClick={() => setActiveWs(null)}>← Back</button>
                        ) : (
                            <>
                                <span className="ws-icon">🏢</span>
                                <h2>Workspaces</h2>
                                <span className="ur-count">{workspaces.length}</span>
                            </>
                        )}
                    </div>
                    <button className="modal-close" onClick={() => { setShowWorkspaces(false); setActiveWs(null); }}>✕</button>
                </div>

                {flash && (
                    <div className={`admin-flash ${flash.type}`}>
                        {flash.type === 'success' ? '✓' : '⚠'} {flash.text}
                    </div>
                )}

                {/* ── LIST VIEW ── */}
                {!activeWs && (
                    <>
                        <div className="ws-toolbar">
                            <button className="ur-save-btn" onClick={handleCreateOpen}>
                                ＋ New Workspace
                            </button>
                        </div>

                        <div className="ws-content">
                            {loading && <div className="admin-loading">Loading workspaces…</div>}
                            {!loading && workspaces.length === 0 && (
                                <div className="ur-empty">
                                    <span className="ur-empty-icon">🏢</span>
                                    <p>No workspaces yet</p>
                                    <p className="ur-empty-hint">Create a workspace to collaborate on a rocket design with others!</p>
                                </div>
                            )}
                            {!loading && workspaces.length > 0 && (
                                <div className="ur-grid">
                                    {workspaces.map(ws => (
                                        <div key={ws.id} className="ws-card">
                                            <div className="ws-card-top">
                                                <div className="ws-card-header">
                                                    <span className="ws-card-icon">🏢</span>
                                                    <div className="ws-card-info">
                                                        <h3>{ws.name}</h3>
                                                        {ws.description && <p className="ur-card-desc">{ws.description}</p>}
                                                    </div>
                                                </div>
                                                <div className="ws-card-meta">
                                                    <span className="ws-meta-item">🚀 {ws.rocketName || (ws.rocketId ? 'Unnamed' : 'No rocket yet')}</span>
                                                    <span className="ws-meta-item">👤 {ws.ownerUsername}</span>
                                                    <span className="ws-meta-item">👥 {ws.members.length + 1} member{ws.members.length !== 0 ? 's' : ''}</span>
                                                </div>
                                                <div className="ws-card-role">
                                                    {isOwner(ws) ? (
                                                        <span className="ws-role-badge owner">Owner</span>
                                                    ) : (
                                                        <span className="ws-role-badge member" style={{ borderColor: PERM_COLORS[getMyPermission(ws)] }}>
                                                            {PERM_LABELS[getMyPermission(ws)]}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="ws-card-actions">
                                                <button className="ur-load-btn" onClick={() => handleOpenWorkspace(ws)}>
                                                    Open
                                                </button>
                                                {isOwner(ws) ? (
                                                    <button className="action-btn danger" onClick={() => handleDelete(ws)} title="Delete workspace">🗑</button>
                                                ) : (
                                                    <button className="action-btn danger" onClick={() => handleLeave(ws)} title="Leave workspace">🚪</button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* ── DETAIL VIEW ── */}
                {activeWs && (
                    <div className="ws-detail">
                        {/* Info bar */}
                        <div className="ws-detail-info">
                            <div className="ws-detail-title">
                                <h3>{activeWs.name}</h3>
                                {isOwner(activeWs) && (
                                    <button className="ws-edit-btn" onClick={() => { setEditName(activeWs.name); setEditDesc(activeWs.description); setShowEditWs(true); }}>✎</button>
                                )}
                            </div>
                            {activeWs.description && <p className="ws-detail-desc">{activeWs.description}</p>}
                            <div className="ws-detail-meta">
                                <span>🚀 {activeWs.rocketName || (activeWs.rocketId ? 'Unnamed Rocket' : 'No rocket linked')}</span>
                                <span>👤 Owner: {activeWs.ownerUsername}</span>
                                <span>Your access: <strong style={{ color: PERM_COLORS[activePermission] }}>{PERM_LABELS[activePermission]}</strong></span>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="ws-detail-actions">
                            {activeWs.rocketId ? (
                                <button className="ur-load-btn" onClick={handleLoadRocket}>
                                    📂 Load Rocket
                                </button>
                            ) : (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No rocket linked yet{activePermission === 'read-write' ? ' — save your current design to get started!' : '.'}</span>
                            )}
                            {activePermission === 'read-write' && (
                                <button className="ur-save-btn" onClick={handleSaveToWorkspace}>
                                    💾 {activeWs.rocketId ? 'Save Current Design to Workspace' : 'Save Current Design as Workspace Rocket'}
                                </button>
                            )}
                            {activePermission === 'download' && activeWs.rocketId && (
                                <button className="ur-load-btn" onClick={handleLoadRocket}>
                                    ⬇️ Download Rocket
                                </button>
                            )}
                        </div>

                        {/* Members section */}
                        <div className="ws-members-section">
                            <div className="ws-members-header">
                                <h4>👥 Members ({activeWs.members.length + 1})</h4>
                                {isOwner(activeWs) && (
                                    <button className="ws-invite-btn" onClick={() => { setShowAddMember(true); setInviteEmail(''); setInvitePerm('readonly'); }}>
                                        ＋ Add Member
                                    </button>
                                )}
                            </div>

                            <div className="ws-members-list">
                                {/* Owner */}
                                <div className="ws-member-row owner-row">
                                    <div className="ws-member-info">
                                        <span className="ws-member-avatar">{activeWs.ownerUsername[0].toUpperCase()}</span>
                                        <div>
                                            <span className="ws-member-name">{activeWs.ownerUsername}</span>
                                            <span className="ws-member-role">Owner</span>
                                        </div>
                                    </div>
                                    <span className="ws-perm-badge" style={{ color: PERM_COLORS['read-write'] }}>Full Access</span>
                                </div>

                                {/* Members */}
                                {activeWs.members.map(m => (
                                    <div key={m.userId} className="ws-member-row">
                                        <div className="ws-member-info">
                                            <span className="ws-member-avatar">{m.username[0].toUpperCase()}</span>
                                            <div>
                                                <span className="ws-member-name">{m.username}</span>
                                                <span className="ws-member-email">{m.email}</span>
                                            </div>
                                        </div>
                                        <div className="ws-member-controls">
                                            {isOwner(activeWs) ? (
                                                <>
                                                    <select
                                                        className="ws-perm-select"
                                                        value={m.permission}
                                                        onChange={e => handlePermChange(m.userId, e.target.value as MemberPermission)}
                                                    >
                                                        <option value="readonly">👁 Read Only</option>
                                                        <option value="read-write">✏️ Read & Write</option>
                                                        <option value="download">⬇️ Download</option>
                                                    </select>
                                                    <button
                                                        className="ws-remove-member-btn"
                                                        onClick={() => handleRemoveMember(m.userId, m.username)}
                                                        title={`Remove ${m.username}`}
                                                    >✕</button>
                                                </>
                                            ) : (
                                                <span className="ws-perm-badge" style={{ color: PERM_COLORS[m.permission] }}>
                                                    {PERM_LABELS[m.permission]}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {activeWs.members.length === 0 && (
                                    <div className="ws-no-members">No members yet. {isOwner(activeWs) ? 'Add members by their email address.' : ''}</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── CREATE DIALOG ── */}
                {showCreate && (
                    <div className="reset-modal" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
                        <div className="reset-body">
                            <h3>🏢 Create Workspace</h3>
                            <div className="auth-field">
                                <label>Workspace Name</label>
                                <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="e.g. Team Alpha Rocket" autoFocus />
                            </div>
                            <div className="auth-field">
                                <label>Description (optional)</label>
                                <input type="text" value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="Brief description…" />
                            </div>
                            <div className="auth-field">
                                <label>Link a Rocket (optional)</label>
                                {myRockets.length === 0 ? (
                                    <p className="ws-no-rockets-hint">No saved rockets yet — you can link one later or save your current design into the workspace.</p>
                                ) : (
                                    <select className="ws-rocket-select" value={createRocketId} onChange={e => setCreateRocketId(e.target.value)}>
                                        <option value="">— No rocket (link later) —</option>
                                        {myRockets.map(r => (
                                            <option key={r.id} value={r.id}>🚀 {r.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="reset-actions">
                                <button className="admin-btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                                <button className="auth-submit" onClick={handleCreate} disabled={creating || !createName.trim()}>
                                    {creating ? 'Creating…' : 'Create Workspace'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── ADD MEMBER DIALOG ── */}
                {showAddMember && (
                    <div className="reset-modal" onClick={e => { if (e.target === e.currentTarget) setShowAddMember(false); }}>
                        <div className="reset-body">
                            <h3>👥 Add Member</h3>
                            <div className="auth-field">
                                <label>Email Address</label>
                                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@example.com" autoFocus />
                            </div>
                            <div className="auth-field">
                                <label>Permission</label>
                                <select className="ws-perm-select-full" value={invitePerm} onChange={e => setInvitePerm(e.target.value as MemberPermission)}>
                                    <option value="readonly">👁 Read Only — can view the rocket</option>
                                    <option value="read-write">✏️ Read & Write — can modify the rocket</option>
                                    <option value="download">⬇️ Download — can load a copy to their editor</option>
                                </select>
                            </div>
                            <div className="reset-actions">
                                <button className="admin-btn-secondary" onClick={() => setShowAddMember(false)}>Cancel</button>
                                <button className="auth-submit" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                                    {inviting ? 'Adding…' : 'Add Member'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── EDIT WORKSPACE DIALOG ── */}
                {showEditWs && (
                    <div className="reset-modal" onClick={e => { if (e.target === e.currentTarget) setShowEditWs(false); }}>
                        <div className="reset-body">
                            <h3>✎ Edit Workspace</h3>
                            <div className="auth-field">
                                <label>Name</label>
                                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                            </div>
                            <div className="auth-field">
                                <label>Description</label>
                                <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                            </div>
                            <div className="reset-actions">
                                <button className="admin-btn-secondary" onClick={() => setShowEditWs(false)}>Cancel</button>
                                <button className="auth-submit" onClick={handleEditWs}>Save</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
