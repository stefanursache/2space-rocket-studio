// ===========================
// 6-DOF Flight Simulation
// ===========================

import {
    Rocket, Motor, SimulationOptions, SimulationDataPoint,
    SimulationResult, SimulationEvent, Parachute, Streamer, Airbrakes
} from '../types/rocket';
import { getAtmosphere, getGravityAtLatitude, getDynamicPressure, getMachNumber, getWindSpeed } from './atmosphere';
import {
    calculateDrag, calculateStability, calculateMassAndCG,
    getReferenceArea, getRocketLength, findRecoveryDevices,
    findAirbrakes, calculateAirbrakesDrag, calculateSingleAirbrakeDrag
} from './aerodynamics';
import { interpolateThrust } from '../models/motors';
import { v4 as uuid } from 'uuid';
import {
    AngularRate, IDENTITY_QUATERNION, Quaternion, angularAcceleration,
    chooseAdaptiveTimeStep, integrateQuaternion, quaternionForward,
} from './attitude';
import { motorStateAtTime } from './motorDynamics';
import { calculateMassProperties } from './massProperties';
import { FlightEventQueue } from './flightEvents';

interface SimState {
    time: number;
    // Position (m) - x=east, y=up, z=north
    posX: number;
    posY: number;  // altitude
    posZ: number;
    // Velocity (m/s)
    velX: number;
    velY: number;
    velZ: number;
    // Mass (kg)
    mass: number;
    // Phase tracking
    onLaunchRod: boolean;
    motorBurnedOut: boolean;
    atApogee: boolean;
    recoveryDeployed: boolean;
    landed: boolean;
    orientation: Quaternion;
    angularRate: AngularRate;
}

interface TranslationalState {
    position: [number, number, number];
    velocity: [number, number, number];
}

function integrateRK4(
    current: TranslationalState,
    acceleration: [number, number, number],
    dt: number,
): TranslationalState {
    const derivative = (state: TranslationalState): TranslationalState => ({
        position: state.velocity,
        velocity: acceleration,
    });
    const addScaled = (state: TranslationalState, derivativeState: TranslationalState, scale: number): TranslationalState => ({
        position: state.position.map((value, i) => value + derivativeState.position[i] * scale) as [number, number, number],
        velocity: state.velocity.map((value, i) => value + derivativeState.velocity[i] * scale) as [number, number, number],
    });
    const addWeighted = (
        base: TranslationalState,
        k1: TranslationalState,
        k2: TranslationalState,
        k3: TranslationalState,
        k4: TranslationalState,
    ): TranslationalState => ({
        position: base.position.map((value, i) =>
            value + dt * (k1.position[i] + 2 * k2.position[i] + 2 * k3.position[i] + k4.position[i]) / 6
        ) as [number, number, number],
        velocity: base.velocity.map((value, i) =>
            value + dt * (k1.velocity[i] + 2 * k2.velocity[i] + 2 * k3.velocity[i] + k4.velocity[i]) / 6
        ) as [number, number, number],
    });

    const k1 = derivative(current);
    const k2 = derivative(addScaled(current, k1, dt / 2));
    const k3 = derivative(addScaled(current, k2, dt / 2));
    const k4 = derivative(addScaled(current, k3, dt));
    return addWeighted(current, k1, k2, k3, k4);
}

export function runSimulation(
    rocket: Rocket,
    motor: Motor | null,
    options: SimulationOptions,
    motorPosition: number = 0
): SimulationResult {
    const configuredTimeStep = options.timeStep || 0.01;
    const maxTime = options.maxTime || 300;
    const data: SimulationDataPoint[] = [];
    const events: SimulationEvent[] = [];
    const eventQueue = new FlightEventQueue();

    // Initial conditions
    const launchAngle = (options.launchRodAngle || 0) * Math.PI / 180;
    const launchDir = (options.launchRodDirection || 0) * Math.PI / 180;

    let activeRocket = rocket;
    const stability = calculateStability(activeRocket, motor, motorPosition);
    let { totalMass: structuralMass } = calculateMassAndCG(activeRocket);
    let refArea = getReferenceArea(activeRocket);
    let rocketLength = getRocketLength(activeRocket);

    // Launch rod direction components
    const rodDirX = Math.sin(launchAngle) * Math.sin(launchDir);
    const rodDirY = Math.cos(launchAngle);
    const rodDirZ = Math.sin(launchAngle) * Math.cos(launchDir);

    // Dry mass of rocket (without motor propellant)
    let rocketDryMass = structuralMass;
    const motorCasingMass = motor ? (motor.totalMass - motor.propellantMass) : 0;
    const initialMass = rocketDryMass + (motor ? motor.totalMass : 0);
    let minMass = rocketDryMass + motorCasingMass; // floor after burnout
    let propellantRemaining = motor ? motor.propellantMass : 0;

    // Body axis direction (unit vector — starts along launch rod)
    let bodyDirX = rodDirX;
    let bodyDirY = rodDirY;
    let bodyDirZ = rodDirZ;

    const state: SimState = {
        time: 0,
        posX: 0,
        posY: options.launchAltitude || 0,
        posZ: 0,
        velX: 0,
        velY: 0,
        velZ: 0,
        mass: initialMass,
        onLaunchRod: true,
        motorBurnedOut: motor === null,
        atApogee: false,
        recoveryDeployed: false,
        landed: false,
        orientation: IDENTITY_QUATERNION,
        angularRate: { x: 0, y: 0, z: 0 },
    };

    // Recovery devices — track each one individually
    const recoveryDevices = findRecoveryDevices(activeRocket);
    const hasRecovery = recoveryDevices.length > 0;

    interface RecoveryState {
        device: Parachute | Streamer;
        deployed: boolean;
        area: number;        // effective area when deployed
        cd: number;          // drag coefficient
        deployEvent: 'apogee' | 'altitude' | 'timer';
        deployDelay: number; // seconds after trigger event
        deployAltitude: number; // altitude trigger (AGL)
        triggerTime: number; // time when trigger condition was met (-1 = not yet)
        triggerSpeed: number;
    }

    const recoveryStates: RecoveryState[] = recoveryDevices.map(dev => {
        if (dev.type === 'parachute') {
            const chute = dev as Parachute;
            return {
                device: chute,
                deployed: false,
                area: Math.PI * (chute.diameter / 2) ** 2 || 0.3,
                cd: chute.cd || 0.8,
                deployEvent: chute.deployEvent || 'apogee',
                deployDelay: chute.deployDelay || 0,
                deployAltitude: chute.deployAltitude || 200,
                triggerTime: -1,
                triggerSpeed: 0,
            };
        } else {
            const str = dev as Streamer;
            return {
                device: str,
                deployed: false,
                area: (str.stripLength * str.stripWidth) || 0.3,
                cd: str.cd || 0.8,
                deployEvent: str.deployEvent || 'apogee',
                deployDelay: str.deployDelay || 0,
                deployAltitude: str.deployAltitude || 200,
                triggerTime: -1,
                triggerSpeed: 0,
            };
        }
    });

    // Airbrakes — track each one individually
    interface AirbrakesState {
        device: Airbrakes;
        triggered: boolean;    // whether the trigger condition has been met
        triggerTime: number;   // time when trigger was met (-1 = not yet)
        deployFraction: number; // 0..1, current deployment fraction
    }

    const airbrakesDevices = findAirbrakes(activeRocket);
    const airbrakesStates: AirbrakesState[] = airbrakesDevices.map(dev => {
        const ab = dev as Airbrakes;
        return {
            device: ab,
            triggered: false,
            triggerTime: -1,
            deployFraction: 0,
        };
    });

    /** Compute current total recovery area and max Cd from deployed devices */
    function getActiveRecovery(): { area: number; cdArea: number } {
        let area = 0, cdArea = 0;
        for (const rs of recoveryStates) {
            if (rs.deployed) {
                area += rs.area;
                cdArea += rs.area * rs.cd;
            }
        }
        return { area, cdArea };
    }

    const launchRodLength = options.launchRodLength || 1.0;

    // Track time since rod clear for gradual weathercocking ramp-up
    let timeSinceRodClear = 0;

    // Log launch event
    events.push({
        time: 0, altitude: state.posY,
        type: 'launch', description: 'Launch'
    });
    eventQueue.enqueue({ type: 'launch', time: 0 });
    if (motor) {
        eventQueue.enqueue({ type: 'ignition', time: 0, motorId: motor.id });
    }

    let maxAlt = 0, maxVel = 0, maxAccel = 0, maxMach = 0;
    let launchRodVelocity = 0;
    let deploymentVelocity = 0;
    let groundHitVelocity = 0;
    let prevVelY = 0;
    let previousTimeStep = configuredTimeStep;

    // ===== Main simulation loop =====
    while (state.time < maxTime && !state.landed) {
        for (const queued of eventQueue.popReady(state.time)) {
            if (queued.type === 'ignition') {
                events.push({
                    time: queued.time,
                    altitude: state.posY,
                    type: 'ignition',
                    description: `Motor ignition (${motor?.designation ?? 'motor'})`,
                });
            }
            if (queued.type === 'ejection_charge') {
                events.push({
                    time: queued.time,
                    altitude: state.posY,
                    type: 'ejection',
                    description: 'Ejection charge',
                });
            }
            if (queued.type === 'stage_separation') {
                if (queued.stage !== undefined && activeRocket.stages.length > 1) {
                    activeRocket = {
                        ...activeRocket,
                        stages: activeRocket.stages.filter((_, index) => index !== queued.stage),
                    };
                    structuralMass = calculateMassAndCG(activeRocket).totalMass;
                    rocketDryMass = structuralMass;
                    minMass = rocketDryMass + motorCasingMass;
                    refArea = getReferenceArea(activeRocket);
                    rocketLength = getRocketLength(activeRocket);
                }
                events.push({
                    time: queued.time,
                    altitude: state.posY,
                    type: 'separation',
                    description: `Stage ${queued.stage ?? 1} separation`,
                });
            }
            if (queued.type === 'deployment') {
                const recovery = recoveryStates.find(item => item.device.id === queued.source);
                if (recovery && !recovery.deployed) {
                    recovery.deployed = true;
                    const speed = recovery.triggerSpeed;
                    if (recovery.deployEvent === 'altitude' && deploymentVelocity === 0) {
                        deploymentVelocity = speed;
                    }
                    events.push({
                        time: queued.time,
                        altitude: state.posY,
                        type: 'deployment',
                        description: `${recovery.device.name || 'Recovery device'} deployed (v=${speed.toFixed(1)} m/s)`,
                    });
                }
            }
        }
        const remainingTime = maxTime - state.time;
        const adaptiveTimeStep = chooseAdaptiveTimeStep(
            configuredTimeStep,
            previousTimeStep,
            state.onLaunchRod,
            launchRodLength,
            Math.hypot(state.velX, state.velY, state.velZ),
            state.angularRate,
            { x: 0, y: 0, z: 0 },
        );
        const nextEventTime = eventQueue.nextTime();
        const dt = Math.min(
            adaptiveTimeStep,
            remainingTime,
            nextEventTime !== undefined && nextEventTime > state.time
                ? nextEventTime - state.time
                : adaptiveTimeStep,
        );
        previousTimeStep = dt;
        const atm = getAtmosphere(state.posY, options.launchTemperature, options.launchPressure);
        const g = getGravityAtLatitude(state.posY, options.launchLatitude || 0);

        // Wind (pass direction)
        const wind = getWindSpeed(
            state.posY - (options.launchAltitude || 0),
            options.windSpeedAvg || 0,
            options.windSpeedStdDev || 0,
            options.windDirection || 0,
            state.time,
            Math.round((options.launchLatitude || 0) * 1000 + (options.launchLongitude || 0)),
        );

        // Relative velocity (rocket velocity minus wind)
        const relVelX = state.velX - wind.x;
        const relVelY = state.velY;
        const relVelZ = state.velZ - wind.z;
        const relSpeed = Math.sqrt(relVelX ** 2 + relVelY ** 2 + relVelZ ** 2);

        // Thrust
        let thrust = 0;
        if (motor && !state.motorBurnedOut) {
            thrust = interpolateThrust(motor, state.time);
            if (thrust > 0) {
                // Mass flow proportional to instantaneous thrust
                // dm/dt = T(t) * m_prop / I_total
                const totalImpulse = motor.totalImpulse;
                const massFlowRate = totalImpulse > 0
                    ? thrust * motor.propellantMass / totalImpulse
                    : motor.propellantMass / motor.burnTime;
                propellantRemaining -= massFlowRate * dt;
                propellantRemaining = Math.max(0, propellantRemaining);
            }
        }

        if (motor) {
            const motorState = motorStateAtTime(motor, state.time);
            propellantRemaining = motorState.propellantMass;
            state.mass = rocketDryMass + motorState.totalMass;
        } else {
            state.mass = rocketDryMass;
        }

        // Check burnout
        if (motor && !state.motorBurnedOut && state.time >= motor.burnTime) {
            state.motorBurnedOut = true;
            propellantRemaining = 0;
            state.mass = minMass; // ensure exact dry mass
            events.push({
                time: state.time, altitude: state.posY,
                type: 'burnout', description: `Motor burnout (${motor.designation})`
            });
            eventQueue.enqueue({
                type: 'ejection_charge',
                time: state.time,
                motorId: motor.id,
            });
            rocket.stages.forEach((stage, index) => {
                if (index > 0 && stage.separationEvent === 'burnout') {
                    eventQueue.enqueue({
                        type: 'stage_separation',
                        time: state.time + Math.max(0, stage.separationDelay),
                        stage: index,
                    });
                }
            });
        }

        // Aerodynamic drag
        let dragForce = 0;
        let cd = 0;

        if (relSpeed > 0.01) {
            const activeRec = getActiveRecovery();
            if (activeRec.area > 0) {
                // OpenRocket accumulates deployed-device CdA independently.
                // This matters when a parachute and streamer have different Cd.
                cd = activeRec.cdArea / refArea;
                const q = getDynamicPressure(relSpeed, atm.density);
                dragForce = q * activeRec.cdArea;
            } else {
                const aeroForces = calculateDrag(
                    activeRocket, relSpeed, state.posY,
                    motor || undefined, motorPosition, propellantRemaining,
                    options.launchTemperature, options.launchPressure
                );
                // calculateDrag now includes fully-deployed airbrakes (cdAirbrakes).
                // Subtract it and add the actual partial deployment contribution
                // so the simulation can ramp each device independently.
                cd = aeroForces.cd - aeroForces.cdAirbrakes; // base aero without airbrakes
                const q = getDynamicPressure(relSpeed, atm.density);

                // Airbrakes drag — sum each device at its current deployFraction
                let cdAB = 0;
                for (const abs of airbrakesStates) {
                    if (abs.deployFraction > 0) {
                        cdAB += calculateSingleAirbrakeDrag(
                            abs.device, refArea, abs.deployFraction
                        );
                    }
                }
                cd += cdAB;
                dragForce = q * cd * refArea;
            }
        }

        // Airbrakes deployment logic (before force application)
        const altAGLForAB = state.posY - (options.launchAltitude || 0);
        const burnoutTimeAB = motor ? motor.burnTime : 0;
        for (const abs of airbrakesStates) {
            const ab = abs.device;
            if (ab.deployEvent === 'never') continue;

            // Check trigger conditions
            if (!abs.triggered) {
                let shouldTrigger = false;
                if (ab.deployEvent === 'altitude' && altAGLForAB >= ab.deployAltitude && !state.atApogee) {
                    shouldTrigger = true; // ascending past target altitude
                } else if (ab.deployEvent === 'burnout' && state.motorBurnedOut) {
                    shouldTrigger = true;
                } else if (ab.deployEvent === 'apogee' && state.atApogee) {
                    shouldTrigger = true;
                } else if (ab.deployEvent === 'timer' && state.time >= ab.deployDelay) {
                    shouldTrigger = true;
                }
                if (shouldTrigger) {
                    abs.triggered = true;
                    abs.triggerTime = state.time;
                }
            }

            // Ramp deployment after trigger + delay
            if (abs.triggered && abs.deployFraction < 1) {
                const delayOffset = ab.deployEvent === 'timer' ? 0 : ab.deployDelay;
                const deployStart = abs.triggerTime + delayOffset;
                if (state.time >= deployStart) {
                    const elapsed = state.time - deployStart;
                    const speed = ab.deploySpeed > 0 ? ab.deploySpeed : 0.3;
                    abs.deployFraction = Math.min(1, elapsed / speed);

                    // Fire event when deployment starts
                    if (abs.deployFraction > 0 && elapsed <= dt * 1.5) {
                        events.push({
                            time: state.time, altitude: state.posY,
                            type: 'airbrakes_deploy',
                            description: `${ab.name} deploying (alt=${altAGLForAB.toFixed(0)} m AGL)`
                        });
                    }
                }
            }
        }

        // Force components
        let forceX = 0, forceY = 0, forceZ = 0;

        // Gravity
        forceY -= state.mass * g;

        if (state.onLaunchRod) {
            // Constrain to launch rod direction
            const thrustX = thrust * rodDirX;
            const thrustY = thrust * rodDirY;
            const thrustZ = thrust * rodDirZ;

            // Drag opposes velocity direction
            const speed = Math.sqrt(state.velX ** 2 + state.velY ** 2 + state.velZ ** 2);
            if (speed > 0) {
                forceX += thrustX - dragForce * state.velX / speed;
                forceY += thrustY - dragForce * state.velY / speed;
                forceZ += thrustZ - dragForce * state.velZ / speed;
            } else {
                forceX += thrustX;
                forceY += thrustY;
                forceZ += thrustZ;
            }

            // Project net force onto rod direction
            const netForceAlongRod = forceX * rodDirX + forceY * rodDirY + forceZ * rodDirZ;

            // Only allow motion along rod if positive
            if (netForceAlongRod > 0) {
                forceX = netForceAlongRod * rodDirX;
                forceY = netForceAlongRod * rodDirY;
                forceZ = netForceAlongRod * rodDirZ;
            } else {
                forceX = 0;
                forceY = 0;
                forceZ = 0;
            }

            // Check if cleared launch rod
            const distFromLaunch = Math.sqrt(state.posX ** 2 + (state.posY - (options.launchAltitude || 0)) ** 2 + state.posZ ** 2);
            if (distFromLaunch >= launchRodLength) {
                state.onLaunchRod = false;
                const speed = Math.sqrt(state.velX ** 2 + state.velY ** 2 + state.velZ ** 2);
                launchRodVelocity = speed;
                // Set body axis to launch rod direction (rocket leaves rod aligned with it)
                bodyDirX = rodDirX;
                bodyDirY = rodDirY;
                bodyDirZ = rodDirZ;
                events.push({
                    time: state.time, altitude: state.posY,
                    type: 'launchrod', description: `Launch rod cleared (v=${speed.toFixed(1)} m/s)`
                });
            }
        } else {
            // Free flight — thrust along body axis, not velocity vector
            const speed = Math.sqrt(state.velX ** 2 + state.velY ** 2 + state.velZ ** 2);
            timeSinceRodClear += dt;

            // Weathercocking: body axis gradually aligns toward relative velocity.
            // The restoring moment depends on:
            //   - Stability margin (further CP behind CG = stronger moment)
            //   - Dynamic pressure (faster flight = stronger aerodynamic moment)
            //   - Rocket moment of inertia (heavier/longer = slower rotation)
            // We model this as exponential tracking with a physically-based tau.
            //
            // After leaving the launch rod, we ramp up the weathercocking authority
            // over ~0.8s to prevent the body axis from snapping abruptly.
            if (relSpeed > 1.0) {
                const currentMach = getMachNumber(relSpeed, atm.speedOfSound);
                const currentStab = calculateStability(
                    activeRocket, motor || undefined, motorPosition,
                    propellantRemaining, currentMach
                );
                const relUx = relVelX / relSpeed;
                const relUy = relVelY / relSpeed;
                const relUz = relVelZ / relSpeed;

                const stabMargin = Math.max(currentStab.stabilityMargin, 0);

                // Dynamic pressure factor: weathercocking is proportional to q
                // At low speed the moment is negligible; at high speed it's strong.
                // Reference: q at ~50 m/s sea level ≈ 1530 Pa gives moderate response.
                const q = getDynamicPressure(relSpeed, atm.density);
                const qRef = 1500; // reference dynamic pressure (Pa)
                const qFactor = Math.min(q / qRef, 3.0); // cap to avoid over-rotation

                // Moment of inertia factor: longer/heavier rockets rotate slower
                // Approximate MOI as m*L²/12 for a uniform rod
                const moiFactor = Math.max(state.mass * rocketLength * rocketLength / 12, 0.001);
                // Reference MOI for a small model rocket (~0.05 kg, ~0.3 m)
                const moiRef = 0.05 * 0.3 * 0.3 / 12; // ≈ 0.000375
                const moiRatio = moiRef / moiFactor; // <1 for heavier rockets = slower

                // Base time constant: stable rockets respond in ~0.4s at qRef
                // tau = base / (stabMargin * qFactor * moiRatio)
                const baseTau = 0.6;
                const effectiveTau = stabMargin > 0.05
                    ? baseTau / (stabMargin * Math.max(qFactor, 0.05) * Math.min(moiRatio, 2.0))
                    : 10.0; // near-neutral stability → very slow response
                const tau = Math.max(effectiveTau, 0.15); // never faster than 0.15s

                // Gradual ramp-up of weathercocking after leaving launch rod.
                // This prevents the body axis from snapping to a new direction
                // the instant the rocket clears the rod.
                const rodClearRamp = Math.min(1.0, timeSinceRodClear / 0.8);

                const blend = Math.min(1, dt / tau) * rodClearRamp;
                bodyDirX += (relUx - bodyDirX) * blend;
                bodyDirY += (relUy - bodyDirY) * blend;
                bodyDirZ += (relUz - bodyDirZ) * blend;

                // Re-normalize
                const bLen = Math.sqrt(bodyDirX ** 2 + bodyDirY ** 2 + bodyDirZ ** 2);
                if (bLen > 0.001) {
                    bodyDirX /= bLen; bodyDirY /= bLen; bodyDirZ /= bLen;
                }

                const desiredDirection: [number, number, number] = [relUx, relUy, relUz];
                const currentDirection: [number, number, number] = [bodyDirX, bodyDirY, bodyDirZ];
                const inertia = Math.max(state.mass * rocketLength ** 2 / 12, 1e-6);
                const angularAccel = angularAcceleration(
                    state.angularRate,
                    desiredDirection,
                    currentDirection,
                    q,
                    1 / inertia,
                );
                state.angularRate = {
                    x: state.angularRate.x + angularAccel.x * dt,
                    y: state.angularRate.y + angularAccel.y * dt,
                    z: state.angularRate.z + angularAccel.z * dt,
                };
                state.orientation = integrateQuaternion(state.orientation, state.angularRate, dt);
                const quaternionDirection = quaternionForward(state.orientation);
                if (quaternionDirection.every(Number.isFinite)) {
                    bodyDirX = quaternionDirection[0];
                    bodyDirY = quaternionDirection[1];
                    bodyDirZ = quaternionDirection[2];
                }
            }

            // Thrust along body axis
            if (thrust > 0) {
                forceX += thrust * bodyDirX;
                forceY += thrust * bodyDirY;
                forceZ += thrust * bodyDirZ;
            }

            // Drag opposes relative velocity
            if (relSpeed > 0.01 && dragForce > 0) {
                forceX -= dragForce * relVelX / relSpeed;
                forceY -= dragForce * relVelY / relSpeed;
                forceZ -= dragForce * relVelZ / relSpeed;
            }
        }

        // Acceleration
        const massProperties = calculateMassProperties(activeRocket, motor, motorPosition, state.time);
        const accelX = forceX / Math.max(massProperties.mass, 1e-9);
        const accelY = forceY / Math.max(massProperties.mass, 1e-9);
        const accelZ = forceZ / Math.max(massProperties.mass, 1e-9);
        const totalAccel = Math.sqrt(accelX ** 2 + accelY ** 2 + accelZ ** 2);

        // RK4 state integration. The force model is evaluated once per flight
        // step, matching the existing event ordering while using OpenRocket's
        // position/velocity derivative structure.
        const previousAltitude = state.posY;
        const previousVerticalVelocity = state.velY;
        const integrated = integrateRK4(
            {
                position: [state.posX, state.posY, state.posZ],
                velocity: [state.velX, state.velY, state.velZ],
            },
            [accelX, accelY, accelZ],
            dt,
        );
        [state.posX, state.posY, state.posZ] = integrated.position;
        [state.velX, state.velY, state.velZ] = integrated.velocity;

        // Apogee detection
        if (!state.atApogee && prevVelY > 0 && state.velY <= 0 && state.time > 0.1) {
            state.atApogee = true;
            events.push({
                time: state.time, altitude: state.posY,
                type: 'apogee', description: `Apogee (${(state.posY - (options.launchAltitude || 0)).toFixed(1)} m AGL)`
            });

            // Mark trigger time for apogee-triggered devices
            for (const rs of recoveryStates) {
                if (!rs.deployed && rs.deployEvent === 'apogee' && rs.triggerTime < 0) {
                    rs.triggerTime = state.time;
                    eventQueue.enqueue({
                        type: 'deployment',
                        time: state.time + rs.deployDelay,
                        source: rs.device.id,
                    });
                }
            }
        }

        // Per-device recovery deployment logic
        const altAGL = state.posY - (options.launchAltitude || 0);
        const burnoutTime = motor ? motor.burnTime : 0;
        for (const rs of recoveryStates) {
            if (rs.deployed) continue;

            // Check trigger conditions
            if (rs.deployEvent === 'apogee') {
                // Trigger was set at apogee; wait for delay
                if (rs.triggerTime >= 0 && state.time >= rs.triggerTime + rs.deployDelay) {
                    rs.deployed = true;
                }
            } else if (rs.deployEvent === 'altitude') {
                // Deploy when descending below the target altitude
                if (state.atApogee && altAGL <= rs.deployAltitude && state.velY < 0) {
                    if (rs.triggerTime < 0) {
                        const altitudeBefore = previousAltitude - (options.launchAltitude || 0);
                        const altitudeAfter = altAGL;
                        const fraction = altitudeBefore > rs.deployAltitude && altitudeAfter < altitudeBefore
                            ? Math.max(0, Math.min(1, (altitudeBefore - rs.deployAltitude) /
                                Math.max(altitudeBefore - altitudeAfter, 1e-9)))
                            : 1;
                        const speedBefore = Math.hypot(
                            state.velX, previousVerticalVelocity, state.velZ,
                        );
                        const speedAfter = Math.hypot(state.velX, state.velY, state.velZ);
                        rs.triggerSpeed = speedBefore + (speedAfter - speedBefore) * fraction;
                        rs.triggerTime = state.time + fraction * dt;
                        eventQueue.enqueue({
                            type: 'deployment',
                            time: rs.triggerTime + rs.deployDelay,
                            source: rs.device.id,
                        });
                    }
                }
            } else if (rs.deployEvent === 'timer') {
                // Timer starts at motor burnout
                if (state.motorBurnedOut && state.time >= burnoutTime + rs.deployDelay) {
                    if (rs.triggerTime < 0) {
                        rs.triggerTime = state.time;
                        eventQueue.enqueue({
                            type: 'deployment',
                            time: state.time + rs.deployDelay,
                            source: rs.device.id,
                        });
                    }
                }
            }

            // Fire event when newly deployed
            if (rs.deployed) {
                state.recoveryDeployed = true;
                const spd = Math.sqrt(state.velX ** 2 + state.velY ** 2 + state.velZ ** 2);
            if (deploymentVelocity === 0 && rs.deployEvent !== 'apogee') deploymentVelocity = rs.triggerSpeed || spd;
                const devName = rs.device.name || (rs.device.type === 'parachute' ? 'Parachute' : 'Streamer');
                events.push({
                    time: state.time, altitude: state.posY,
                    type: 'deployment',
                    description: `${devName} deployed (v=${spd.toFixed(1)} m/s, alt=${altAGL.toFixed(0)} m AGL)`
                });
            }
        }

        // Ground hit detection
        const groundAlt = options.launchAltitude || 0;
        const crossedGround = !state.onLaunchRod &&
            previousAltitude > groundAlt &&
            state.posY <= groundAlt;
        if (crossedGround) {
            const altitudeDelta = previousAltitude - state.posY;
            const fraction = altitudeDelta > 0
                ? (previousAltitude - groundAlt) / altitudeDelta
                : 1;
            const hitVelY = previousVerticalVelocity + (state.velY - previousVerticalVelocity) * Math.max(0, Math.min(1, fraction));
            const hitVelX = state.velX;
            const hitVelZ = state.velZ;
            const hitSpeed = Math.sqrt(hitVelX ** 2 + hitVelY ** 2 + hitVelZ ** 2);
            // OpenRocket's ground-hit summary reports the vertical landing
            // velocity; retain the full vector magnitude for the event text.
            groundHitVelocity = Math.abs(hitVelY);
            state.posY = groundAlt;
            state.posX -= state.velX * dt * (1 - fraction);
            state.posZ -= state.velZ * dt * (1 - fraction);
            state.velY = 0;
            state.landed = true;
            events.push({
                time: state.time, altitude: state.posY,
                type: 'groundhit', description: `Ground hit (v=${hitSpeed.toFixed(1)} m/s)`
            });
        }

        // Tumble recovery: if past apogee with no recovery device, use higher drag (tumbling)
        if (state.atApogee && !state.recoveryDeployed && !hasRecovery && state.velY < 0) {
            // Tumbling rocket has ~2x the normal Cd
            // This is handled implicitly — no chute means normal drag continues
            // but we should at least note there's no recovery
        }

        // Track statistics
        const speed = Math.sqrt(state.velX ** 2 + state.velY ** 2 + state.velZ ** 2);
        const mach = getMachNumber(speed, atm.speedOfSound);
        const dynPressure = getDynamicPressure(speed, atm.density);

        maxAlt = Math.max(maxAlt, state.posY);
        maxVel = Math.max(maxVel, speed);
        maxAccel = Math.max(maxAccel, totalAccel);
        maxMach = Math.max(maxMach, mach);

        // Record data point
        const lateralDist = Math.sqrt(state.posX ** 2 + state.posZ ** 2);
        const angle = relSpeed > 0.01
            ? Math.asin(Math.min(1, Math.abs(relVelX * state.velY - relVelY * state.velX) / (relSpeed * Math.max(speed, 0.01))))
            : 0;

        // Max airbrakes deployment fraction across all devices
        let maxAbFraction = 0;
        for (const abs of airbrakesStates) {
            maxAbFraction = Math.max(maxAbFraction, abs.deployFraction);
        }

        data.push({
            time: state.time,
            altitude: state.posY - (options.launchAltitude || 0),
            velocity: speed,
            acceleration: totalAccel,
            machNumber: mach,
            thrustForce: thrust,
            dragForce,
            gravityForce: state.mass * g,
            totalMass: state.mass,
            angleOfAttack: angle * 180 / Math.PI,
            lateralDistance: lateralDist,
            positionX: state.posX,
            positionY: state.posY,
            positionZ: state.posZ,
            velocityX: state.velX,
            velocityY: state.velY,
            velocityZ: state.velZ,
            cd,
            dynamicPressure: dynPressure,
            reynoldsNumber: 0,
            airbrakesFraction: maxAbFraction,
        });

        prevVelY = state.velY;
        state.time += dt;
    }

    // Find time to apogee
    const apogeeEvent = events.find(e => e.type === 'apogee');
    const groundEvent = events.find(e => e.type === 'groundhit');

    // Optimal delay
    const burnoutEvent = events.find(e => e.type === 'burnout');
    const optimalDelay = apogeeEvent && burnoutEvent
        ? apogeeEvent.time - burnoutEvent.time
        : 0;

    return {
        id: uuid(),
        name: `Simulation - ${motor?.designation || 'No motor'}`,
        data,
        maxAltitude: maxAlt - (options.launchAltitude || 0),
        maxVelocity: maxVel,
        maxAcceleration: maxAccel,
        maxMach,
        timeToApogee: apogeeEvent?.time || 0,
        flightTime: groundEvent?.time || state.time,
        groundHitVelocity,
        launchRodVelocity,
        deploymentVelocity,
        optimalDelay,
        events,
    };
}

// Default simulation options
export function getDefaultSimulationOptions(): SimulationOptions {
    return {
        motorConfigId: '',
        launchRodLength: 1.0,
        launchRodAngle: 0,
        launchRodDirection: 0,
        windSpeedAvg: 2.0,
        windSpeedStdDev: 0.5,
        windDirection: 90,
        launchAltitude: 0,
        launchLatitude: 45.0,
        launchLongitude: -90.0,
        launchTemperature: 288.15,
        launchPressure: 101325,
        timeStep: 0.01,
        maxTime: 300,
    };
}
