import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';

export const Toolbar: React.FC = () => {
    const {
        rocket, viewMode, setViewMode, show3DView, setShow3DView,
        viewOrientation, setViewOrientation, zoom, setZoom,
        newRocket, loadExampleRocket, setShowMotorSelector, selectedMotor,
        saveRocketToFile, loadRocketFromFile, unitSystem, setUnitSystem,
    } = useStore();

    const { session, setShowAuthModal, setShowAdminPanel, setShowUserRockets, setShowUserSettings, setShowWorkspaces, logout, preferences, isAdminDeviceAuthorized } = useAuthStore();

    const loginBtnColor = preferences?.loginButtonColor || '#3b8eed';
    const [openMenu, setOpenMenu] = useState<'project' | 'workspace' | null>(null);
    const toolbarLeftRef = useRef<HTMLDivElement>(null);

    const resetPanelLayout = () => {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('dock-panel:')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        window.dispatchEvent(new Event('dock-panels-reset'));
    };

    useEffect(() => {
        const onOutside = (event: MouseEvent) => {
            if (!toolbarLeftRef.current) return;
            if (!toolbarLeftRef.current.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        };
        window.addEventListener('mousedown', onOutside);
        return () => window.removeEventListener('mousedown', onOutside);
    }, []);

    return (
        <div className="toolbar">
            <div className="toolbar-left" ref={toolbarLeftRef}>
                <div className="app-logo">
                    <span className="logo-icon">◈</span>
                    <span className="logo-text">2SPACE Rocket Studio</span>
                </div>

                <div className="toolbar-separator" />

                <div className="toolbar-menu-wrap">
                    <button
                        className={`toolbar-menu-trigger ${openMenu === 'project' ? 'active' : ''}`}
                        onClick={() => setOpenMenu(prev => prev === 'project' ? null : 'project')}
                        title="Project actions"
                    >
                        <span className="btn-icon">✦</span>
                        <span className="btn-label">Project</span>
                        <span className="toolbar-menu-caret">▾</span>
                    </button>
                    {openMenu === 'project' && (
                        <div className="toolbar-menu-dropdown">
                            <button className="toolbar-menu-item" onClick={() => { newRocket(); setOpenMenu(null); }}>
                                <span className="btn-icon">＋</span>
                                <span>New</span>
                            </button>
                            <button className="toolbar-menu-item" onClick={() => { loadExampleRocket(); setOpenMenu(null); }}>
                                <span className="btn-icon">✦</span>
                                <span>Example</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="toolbar-separator" />

                <div className="toolbar-menu-wrap">
                    <button
                        className={`toolbar-menu-trigger ${openMenu === 'workspace' ? 'active' : ''}`}
                        onClick={() => setOpenMenu(prev => prev === 'workspace' ? null : 'workspace')}
                        title="Workspace actions"
                    >
                        <span className="btn-icon">📁</span>
                        <span className="btn-label">Workspace</span>
                        <span className="toolbar-menu-caret">▾</span>
                    </button>
                    {openMenu === 'workspace' && (
                        <div className="toolbar-menu-dropdown">
                            <button className="toolbar-menu-item" onClick={() => { saveRocketToFile(); setOpenMenu(null); }}>
                                <span className="btn-icon">⤓</span>
                                <span>Download</span>
                            </button>
                            <button className="toolbar-menu-item" onClick={() => { loadRocketFromFile(); setOpenMenu(null); }}>
                                <span className="btn-icon">📂</span>
                                <span>Open</span>
                            </button>
                            <button className="toolbar-menu-item" onClick={() => { resetPanelLayout(); setOpenMenu(null); }}>
                                <span className="btn-icon">↺</span>
                                <span>Reset Panels</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="toolbar-separator" />

                <div className="rocket-name">
                    <span className="label">Design:</span>
                    <strong>{rocket.name}</strong>
                </div>

                <div className="toolbar-separator" />

                <div className="unit-toggle" title="Toggle metric / US customary units">
                    <button
                        className={`unit-btn ${unitSystem === 'metric' ? 'active' : ''}`}
                        onClick={() => setUnitSystem('metric')}
                    >Metric</button>
                    <button
                        className={`unit-btn ${unitSystem === 'us' ? 'active' : ''}`}
                        onClick={() => setUnitSystem('us')}
                    >US</button>
                </div>
            </div>

            <div className="toolbar-center">
                <div className="view-mode-tabs">
                    <button
                        className={`tab-btn ${viewMode === 'design' ? 'active' : ''}`}
                        onClick={() => setViewMode('design')}
                    >
                        Design
                    </button>
                    <button
                        className={`tab-btn ${viewMode === 'simulation' ? 'active' : ''}`}
                        onClick={() => setViewMode('simulation')}
                    >
                        Simulation
                    </button>
                    <button
                        className={`tab-btn ${viewMode === 'analysis' ? 'active' : ''}`}
                        onClick={() => setViewMode('analysis')}
                    >
                        Analysis
                    </button>
                </div>
            </div>

            <div className="toolbar-right">
                {viewMode === 'design' && (
                    <>
                        <div className="view-options">
                            <button
                                className={`view-btn ${!show3DView && viewOrientation === 'side' ? 'active' : ''}`}
                                onClick={() => { setShow3DView(false); setViewOrientation('side'); }}
                                title="Side View"
                            >
                                Side
                            </button>
                            <button
                                className={`view-btn ${!show3DView && viewOrientation === 'back' ? 'active' : ''}`}
                                onClick={() => { setShow3DView(false); setViewOrientation('back'); }}
                                title="Back View"
                            >
                                Back
                            </button>
                            <button
                                className={`view-btn ${show3DView ? 'active' : ''}`}
                                onClick={() => setShow3DView(!show3DView)}
                                title="3D View"
                            >
                                3D
                            </button>
                        </div>

                        <div className="zoom-controls">
                            <button className="zoom-btn" onClick={() => setZoom(zoom * 0.8)}>−</button>
                            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
                            <button className="zoom-btn" onClick={() => setZoom(zoom * 1.25)}>+</button>
                        </div>
                    </>
                )}

                <button
                    className="toolbar-btn motor-btn"
                    onClick={() => setShowMotorSelector(true)}
                >
                    <span className="btn-icon">◉</span>
                    <span className="btn-label">
                        {selectedMotor ? selectedMotor.designation : 'Motor'}
                    </span>
                </button>

                <div className="toolbar-separator" />

                {/* Auth section */}
                {session ? (
                    <div className="toolbar-auth">
                        <button className="toolbar-auth-icon-btn rockets-btn" onClick={() => setShowUserRockets(true)} title="My Rockets">
                            🚀
                        </button>

                        <div className="toolbar-auth-divider" />

                        <button className="toolbar-auth-icon-btn workspace-btn" onClick={() => setShowWorkspaces(true)} title="Workspaces">
                            🏢
                        </button>

                        <div className="toolbar-auth-divider" />

                        <button className="toolbar-auth-user" onClick={() => setShowUserSettings(true)} title={`Signed in as ${session.username} — Click for settings`}>
                            <span className="toolbar-auth-avatar">
                                {session.username[0].toUpperCase()}
                            </span>
                            <span className="toolbar-auth-name">{session.username}</span>
                            {session.role === 'admin' && <span className="toolbar-auth-role">Admin</span>}
                        </button>

                        {session.role === 'admin' && isAdminDeviceAuthorized && (
                            <>
                                <div className="toolbar-auth-divider" />
                                <button className="toolbar-auth-icon-btn admin-icon-btn" onClick={() => setShowAdminPanel(true)} title="Admin Panel">
                                    🛡
                                </button>
                            </>
                        )}

                        <div className="toolbar-auth-divider" />

                        <button className="toolbar-auth-icon-btn logout-icon-btn" onClick={logout} title="Sign out">
                            ⏻
                        </button>
                    </div>
                ) : (
                    <button
                        className="toolbar-auth-login"
                        onClick={() => setShowAuthModal(true)}
                        style={{ background: loginBtnColor, borderColor: loginBtnColor }}
                    >
                        <span className="toolbar-auth-login-icon">👤</span>
                        <span>Login / Register</span>
                    </button>
                )}
            </div>
        </div>
    );
};
