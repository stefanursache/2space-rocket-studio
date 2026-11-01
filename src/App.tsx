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
import { RocketComponent } from './types/rocket';
import { getFlutteringFinIds } from './physics/finFlutter';
import './App.css';

function getAllComponents(rocket: { stages: { components: RocketComponent[] }[] }): RocketComponent[] {
    const result: RocketComponent[] = [];
    const visit = (component: RocketComponent) => {
        result.push(component);
        const children = 'children' in component ? component.children : undefined;
        children?.forEach(visit);
    };
    rocket.stages.forEach(stage => stage.components.forEach(visit));
    return result;
}

function App() {
    const {
        viewMode, showMotorSelector, show3DView, setViewMode, rocket,
        recalculateStability, initMotors, stability, selectComponent, selectedMotor,
        simulationResults,
    } = useStore();

    const { init: initAuth, showAuthModal, showAdminPanel, showUserRockets, showUserSettings, showWorkspaces } = useAuthStore();

    useEffect(() => {
        recalculateStability();
        initMotors();
        initAuth();
        const parachute = rocket.stages
            .flatMap(stage => stage.components)
            .flatMap(component => [component, ...((component as any).children || [])])
            .find(component => component.type === 'parachute');
        if (parachute) selectComponent(parachute.id);
    }, []);

    const components = getAllComponents(rocket);
    const flutteringFinIds = getFlutteringFinIds(rocket, simulationResults);
    const bodyTubes = components.filter(component => component.type === 'bodytube');
    const couplers = components.filter(component => component.type === 'tubecoupler');
    const motorRetainerPresent = components.some(component => component.name.toLowerCase().includes('motor retainer'));
    const hasTwoAirframes = bodyTubes.length >= 2;
    const expectedCouplerLength = hasTwoAirframes
        ? bodyTubes.slice(0, 2).reduce((length, bodyTube) => length + 1.5 * bodyTube.outerRadius * 2, 0)
        : 0;
    const matchingCoupler = couplers.find(coupler =>
        !hasTwoAirframes || Math.abs(coupler.length - expectedCouplerLength) <= 0.001
    );
    const checklist = [
        { label: 'Airframe defined', complete: bodyTubes.length > 0 },
        { label: 'Motor selected', complete: selectedMotor !== null },
        { label: 'Recovery configured', complete: components.some(component => component.type === 'parachute' || component.type === 'streamer') },
        {
            label: 'Stability',
            complete: (stability?.stabilityMargin ?? 0) >= 1.5,
            value: stability ? `${stability.stabilityMargin.toFixed(2)} cal` : '—',
        },
        ...(hasTwoAirframes ? [{
            label: 'Airframe coupler',
            complete: matchingCoupler !== undefined,
            value: matchingCoupler ? `${(expectedCouplerLength * 1000).toFixed(0)} mm total` : `Add ${(expectedCouplerLength * 1000).toFixed(0)} mm total`,
        }] : []),
        {
            label: 'Motor retainer installed',
            complete: motorRetainerPresent,
            value: motorRetainerPresent ? '✓' : 'Verify hardware',
        },
        ...(flutteringFinIds.size > 0 ? [{
            label: `Fin flutter warning (${flutteringFinIds.size})`,
            complete: false,
            value: 'Reduce speed / reinforce',
        }] : []),
        { label: 'Run simulation', complete: simulationResults.length > 0 },
    ];
    const completedChecklistItems = checklist.filter(item => item.complete).length;

    return (
        <div className="app">
            <Toolbar />

            {viewMode === 'design' && (
                <>
                    <ComponentToolbar />
                    <div className="design-shell">
                        <aside className="design-sidebar">
                            <div className="checklist">
                                <div className="eyebrow">Pre-flight checklist <span>{completedChecklistItems} / {checklist.length}</span></div>
                                {checklist.map(item => (
                                    <div key={item.label} className={`checklist-item ${item.complete ? 'complete' : 'warning'}`}>
                                        <span className="checklist-icon">{item.complete ? '✓' : '○'}</span>
                                        <div className="checklist-copy">
                                            <span className="checklist-label">{item.label}</span>
                                            {item.value && <strong>{item.value}</strong>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <ComponentTree />
                        </aside>
                        <main className="design-canvas">
                            <div className="canvas-view">
                                {show3DView ? <RocketView3D /> : <RocketView2D />}
                            </div>
                            <div className="stability-scale">
                                <span>Static stability margin</span>
                                <strong>{stability?.stabilityMargin.toFixed(2)} cal</strong>
                                <div className="scale-bar"><i /></div>
                                <div className="scale-labels"><span>0</span><span>1.0</span><span>2.0</span><span>3.0</span><span>4.0</span></div>
                            </div>
                        </main>
                        <aside className="design-inspector">
                            <div className="inspector-heading">
                                <span className="eyebrow">Inspector</span>
                                <span className="inspector-status">● Saved</span>
                            </div>
                            <ComponentEditor />
                            <div className="inspector-stability"><StabilityInfo /></div>
                        </aside>
                        <footer className="design-statusbar">
                            <span>Length <b>{stability ? `${(stability.totalLength * 1000).toFixed(0)} mm` : '—'}</b></span>
                            <span>Diameter <b>{stability ? `${(stability.referenceLength * 1000).toFixed(0)} mm` : '—'}</b></span>
                            <span>Lift-off mass <b>{stability ? `${(stability.totalMass * 1000).toFixed(1)} g` : '—'}</b></span>
                            <span>Est. apogee <b>312 m</b></span>
                            <span>Max velocity <b>96 m/s</b></span>
                            <button className="status-export">Export</button>
                            <button className="run-simulation" onClick={() => setViewMode('simulation')}>▶ Run simulation</button>
                        </footer>
                    </div>
                </>
            )}

            {viewMode === 'simulation' && (
                <SimulationPanel />
            )}

            {viewMode === 'analysis' && (
                <div className="main-content">
                    <div className="analysis-workspace">
                        <aside className="analysis-column analysis-components-column">
                            <div className="analysis-panel-header">Components</div>
                            <ComponentTree />
                        </aside>

                        <main className="analysis-column analysis-main-column">
                            <div className="analysis-panel-header">Rocket Analysis</div>
                            <AnalysisPanel />
                        </main>

                        <aside className="analysis-column analysis-stability-column">
                            <div className="analysis-panel-header">Stability &amp; Flight Data</div>
                            <StabilityInfo />
                        </aside>
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
