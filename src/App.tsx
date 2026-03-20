import React, { useEffect } from 'react';
import { useStore } from './store/useStore';
import { useAuthStore } from './store/useAuthStore';
import { Toolbar } from './components/Toolbar';
import { ComponentToolbar } from './components/ComponentToolbar';
import { RocketView2D } from './components/RocketView2D';
import { RocketView3D } from './components/RocketView3D';
import { ComponentTree } from './components/ComponentTree';
import { ComponentEditor } from './components/ComponentEditor';
import { StabilityInfo } from './components/StabilityInfo';
import { SimulationPanel } from './components/SimulationPanel';
import { MotorSelector } from './components/MotorSelector';
import { AnalysisPanel } from './components/AnalysisPanel';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';
import { UserRockets } from './components/UserRockets';
import { UserSettings } from './components/UserSettings';
import { WorkspaceDashboard } from './components/WorkspaceDashboard';
import { DockablePanel } from './components/DockablePanel';
import './App.css';

function App() {
    const {
        viewMode, showMotorSelector, show3DView,
        recalculateStability, initMotors,
    } = useStore();

    const { init: initAuth, showAuthModal, showAdminPanel, showUserRockets, showUserSettings, showWorkspaces } = useAuthStore();

    useEffect(() => {
        recalculateStability();
        initMotors();
        initAuth();
    }, []);

    return (
        <div className="app">
            <Toolbar />

            {viewMode === 'design' && (
                <>
                    <ComponentToolbar />
                    <div className="main-content">
                        <div className="workspace-canvas">
                            <div className="canvas-view">
                                {show3DView ? (
                                    <RocketView3D />
                                ) : (
                                    <RocketView2D />
                                )}
                            </div>

                            <DockablePanel
                                id="design-components"
                                title="Components"
                                initialRect={{ x: 10, y: 10, width: 340, height: 560 }}
                                minWidth={280}
                                minHeight={260}
                            >
                                <ComponentTree />
                            </DockablePanel>

                            <DockablePanel
                                id="design-editor"
                                title="Component Editor"
                                initialRect={{ x: 980, y: 10, width: 360, height: 700 }}
                                minWidth={300}
                                minHeight={320}
                            >
                                <ComponentEditor />
                            </DockablePanel>

                            <DockablePanel
                                id="design-stability"
                                title="Stability & Flight Data"
                                initialRect={{ x: 10, y: 580, width: 340, height: 380 }}
                                minWidth={280}
                                minHeight={320}
                            >
                                <StabilityInfo />
                            </DockablePanel>
                        </div>
                    </div>
                </>
            )}

            {viewMode === 'simulation' && (
                <SimulationPanel />
            )}

            {viewMode === 'analysis' && (
                <div className="main-content">
                    <div className="workspace-canvas">
                        <DockablePanel
                            id="analysis-components"
                            title="Components"
                            initialRect={{ x: 10, y: 10, width: 340, height: 620 }}
                            minWidth={280}
                            minHeight={260}
                        >
                            <ComponentTree />
                        </DockablePanel>

                        <DockablePanel
                            id="analysis-main"
                            title="Rocket Analysis"
                            initialRect={{ x: 360, y: 10, width: 760, height: 860 }}
                            minWidth={420}
                            minHeight={300}
                        >
                            <AnalysisPanel />
                        </DockablePanel>

                        <DockablePanel
                            id="analysis-stability"
                            title="Stability & Flight Data"
                            initialRect={{ x: 1130, y: 10, width: 340, height: 640 }}
                            minWidth={280}
                            minHeight={320}
                        >
                            <StabilityInfo />
                        </DockablePanel>
                    </div>
                </div>
            )}

            {showMotorSelector && <MotorSelector />}
            {showAuthModal && <AuthModal />}
            {showAdminPanel && <AdminPanel />}
            {showUserRockets && <UserRockets />}
            {showUserSettings && <UserSettings />}
            {showWorkspaces && <WorkspaceDashboard />}
        </div>
    );
}

export default App;
