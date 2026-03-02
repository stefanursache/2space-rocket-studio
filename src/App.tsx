import React, { useEffect } from 'react';
import { useStore } from './store/useStore';
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
import './App.css';

function App() {
    const {
        viewMode, showMotorSelector, show3DView,
        recalculateStability, initMotors,
    } = useStore();

    useEffect(() => {
        recalculateStability();
        initMotors();
    }, []);

    return (
        <div className="app">
            <Toolbar />

            {viewMode === 'design' && (
                <>
                    <ComponentToolbar />
                    <div className="main-content">
                        <div className="left-panel">
                            <ComponentTree />
                            <StabilityInfo />
                        </div>

                        <div className="center-panel">
                            {show3DView ? (
                                <RocketView3D />
                            ) : (
                                <RocketView2D />
                            )}
                        </div>

                        <div className="right-panel">
                            <ComponentEditor />
                        </div>
                    </div>
                </>
            )}

            {viewMode === 'simulation' && (
                <SimulationPanel />
            )}

            {viewMode === 'analysis' && (
                <div className="main-content">
                    <div className="left-panel">
                        <ComponentTree />
                    </div>
                    <div className="center-panel">
                        <AnalysisPanel />
                    </div>
                    <div className="right-panel">
                        <StabilityInfo />
                    </div>
                </div>
            )}

            {showMotorSelector && <MotorSelector />}
        </div>
    );
}

export default App;
