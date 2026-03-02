import React from 'react';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';

export const Toolbar: React.FC = () => {
    const {
        rocket, viewMode, setViewMode, show3DView, setShow3DView,
        viewOrientation, setViewOrientation, zoom, setZoom,
        newRocket, loadExampleRocket, setShowMotorSelector, selectedMotor,
        saveRocketToFile, loadRocketFromFile,
    } = useStore();

    const { session, setShowAuthModal, setShowAdminPanel, setShowUserRockets, setShowUserSettings, logout, preferences, isAdminDeviceAuthorized } = useAuthStore();

    const loginBtnColor = preferences?.loginButtonColor || '#3b8eed';

    return (
        <div className="toolbar">
            <div className="toolbar-left">
                <div className="app-logo">
                    <span className="logo-icon">◈</span>
                    <span className="logo-text">2SPACE Rocket Studio</span>
                </div>

                <div className="toolbar-separator" />

                <button className="toolbar-btn" onClick={newRocket} title="New Rocket">
                    <span className="btn-icon">⊞</span>
                    <span className="btn-label">New</span>
                </button>
                <button className="toolbar-btn" onClick={loadExampleRocket} title="Load Example">
                    <span className="btn-icon">⊡</span>
                    <span className="btn-label">Example</span>
                </button>

                <div className="toolbar-separator" />

                <button className="toolbar-btn" onClick={saveRocketToFile} title="Save rocket to file">
                    <span className="btn-icon">💾</span>
                    <span className="btn-label">Save</span>
                </button>
                <button className="toolbar-btn" onClick={loadRocketFromFile} title="Open rocket from file (.ork.json or .ork)">
                    <span className="btn-icon">📂</span>
                    <span className="btn-label">Open</span>
                </button>

                <div className="toolbar-separator" />

                <div className="rocket-name">
                    <span className="label">Design:</span>
                    <strong>{rocket.name}</strong>
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
                        <button className="toolbar-btn rockets-btn" onClick={() => setShowUserRockets(true)} title="My Rockets">
                            <span className="btn-icon">🚀</span>
                            <span className="btn-label">My Rockets</span>
                        </button>
                        <div className="user-badge" title={`Signed in as ${session.username}`}>
                            <span className="user-avatar">{session.username[0].toUpperCase()}</span>
                            <span className="user-name">{session.username}</span>
                            {session.role === 'admin' && <span className="admin-star">⭐</span>}
                        </div>
                        <button className="toolbar-btn settings-btn" onClick={() => setShowUserSettings(true)} title="Account Settings">
                            <span className="btn-icon">⚙</span>
                        </button>
                        {session.role === 'admin' && isAdminDeviceAuthorized && (
                            <button className="toolbar-btn admin-btn-toolbar" onClick={() => setShowAdminPanel(true)} title="Admin Panel">
                                <span className="btn-icon">🛡</span>
                                <span className="btn-label">Admin</span>
                            </button>
                        )}
                        <button className="toolbar-btn logout-btn" onClick={logout} title="Sign out">
                            <span className="btn-icon">⏻</span>
                        </button>
                    </div>
                ) : (
                    <button
                        className="toolbar-btn login-btn"
                        onClick={() => setShowAuthModal(true)}
                        style={{ background: loginBtnColor, borderColor: loginBtnColor }}
                    >
                        <span className="btn-icon">👤</span>
                        <span className="btn-label">Login / Register</span>
                    </button>
                )}
            </div>
        </div>
    );
};
