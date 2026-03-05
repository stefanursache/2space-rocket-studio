// ===========================
// 6-DOF Flight Simulation
// ===========================

import {
    Rocket, Motor, SimulationOptions, SimulationDataPoint,
    SimulationResult, SimulationEvent, Parachute, Streamer, Airbrakes
} from '../types/rocket';
import { getAtmosphere, getGravity, getDynamicPressure, getMachNumber, getWindSpeed, G0 } from './atmosphere';
import {
    calculateDrag, calculateStability, calculateMassAndCG,
    getReferenceArea, getRocketLength, findRecoveryDevices,
    findAirbrakes, calculateAirbrakesDrag
} from './aerodynamics';
import { interpolateThrust } from '../models/motors';
import { v4 as uuid } from 'uuid';

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
}

export function runSimulation(
    rocket: Rocket,
    motor: Motor | null,
    options: SimulationOptions,
    motorPosition: number = 0
): SimulationResult {
    const dt = options.timeStep || 0.01;
    const maxTime = options.maxTime || 300;
    const data: SimulationDataPoint[] = [];
    const events: SimulationEvent[] = [];

    // Initial conditions
    const launchAngle = (options.launchRodAngle || 0) * Math.PI / 180;
    const launchDir = (options.launchRodDirection || 0) * Math.PI / 180;

    const stability = calculateStability(rocket, motor, motorPosition);
    const { totalMass: structuralMass } = calculateMassAndCG(rocket);
    const refArea = getReferenceArea(rocket);
    const rocketLength = getRocketLength(rocket);

    // Launch rod direction components
    const rodDirX = Math.sin(launchAngle) * Math.sin(launchDir);
    const rodDirY = Math.cos(launchAngle);
    const rodDirZ = Math.sin(launchAngle) * Math.cos(launchDir);

    // Dry mass of rocket (without motor propellant)
    const rocketDryMass = structuralMass;
    const motorCasingMass = motor ? (motor.totalMass - motor.propellantMass) : 0;
    const initialMass = rocketDryMass + (motor ? motor.totalMass : 0);
    const minMass = rocketDryMass + motorCasingMass; // floor after burnout
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
    };

    // Recovery devices — track each one individually
    const recoveryDevices = findRecoveryDevices(rocket);
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

    const airbrakesDevices = findAirbrakes(rocket);
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
    function getActiveRecovery(): { area: number; cd: number } {
        let area = 0, cd = 0;
        for (const rs of recoveryStates) {
            if (rs.deployed) {
                area += rs.area;
                cd = Math.max(cd, rs.cd);
            }
        }
        return { area, cd };
    }

    const launchRodLength = options.launchRodLength || 1.0;

    // Log launch event
    events.push({
        time: 0, altitude: state.posY,
        type: 'launch', description: 'Launch'
    });

    let maxAlt = 0, maxVel = 0, maxAccel = 0, maxMach = 0;
    let launchRodVelocity = 0;
    let deploymentVelocity = 0;
    let groundHitVelocity = 0;
    let prevVelY = 0;

    // ===== Main simulation loop =====
    while (state.time < maxTime && !state.landed) {
        const atm = getAtmosphere(state.posY, options.launchTemperature, options.launchPressure);
        const g = getGravity(state.posY);

        // Wind (pass direction)
        const wind = getWindSpeed(
            state.posY - (options.launchAltitude || 0),
            options.windSpeedAvg || 0,
            options.windSpeedStdDev || 0,
            options.windDirection || 0
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
                state.mass = rocketDryMass + motorCasingMass + propellantRemaining;
            }
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
        }

        // Aerodynamic drag
        let dragForce = 0;
        let cd = 0;

        if (relSpeed > 0.01) {
            const activeRec = getActiveRecovery();
            if (activeRec.area > 0) {
                // Use deployed recovery device drag
                cd = activeRec.cd;
                const q = getDynamicPressure(relSpeed, atm.density);
                dragForce = q * cd * activeRec.area;
            } else {
                const aeroForces = calculateDrag(
                    rocket, relSpeed, state.posY,
                    motor || undefined, motorPosition, propellantRemaining,
                    options.launchTemperature, options.launchPressure
                );
                cd = aeroForces.cd;
                const q = getDynamicPressure(relSpeed, atm.density);
                dragForce = q * cd * refArea;

                // Airbrakes additional drag (additive to normal aero drag)
                let maxDeployFraction = 0;
                for (const abs of airbrakesStates) {
                    if (abs.deployFraction > 0) {
                        maxDeployFraction = Math.max(maxDeployFraction, abs.deployFraction);
                    }
                }
                if (maxDeployFraction > 0) {
                    const cdAB = calculateAirbrakesDrag(rocket, refArea, maxDeployFraction);
                    cd += cdAB;
                    dragForce += q * cdAB * refArea;
                }
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

            // Weathercocking: body axis gradually aligns toward relative velocity.
            // Rate depends on stability margin and dynamic pressure.
            // OpenRocket models this via restoring moment; we approximate with
            // exponential tracking. Stable rockets (margin>0) align quickly.
            // Recalculate stability with current propellant and Mach for dynamic tracking
            if (relSpeed > 0.5) {
                const currentMach = getMachNumber(relSpeed, atm.speedOfSound);
                const currentStab = calculateStability(
                    rocket, motor || undefined, motorPosition,
                    propellantRemaining, currentMach
                );
                const relUx = relVelX / relSpeed;
                const relUy = relVelY / relSpeed;
                const relUz = relVelZ / relSpeed;
                // Weathercock rate: higher stability = faster alignment
                // tau ≈ 0.1s for stability margin ~2 cal, slower for marginal rockets
                const stabMargin = Math.max(currentStab.stabilityMargin, 0);
                const tau = stabMargin > 0.1 ? 0.15 / stabMargin : 5.0;
                const blend = Math.min(1, dt / tau);
                bodyDirX += (relUx - bodyDirX) * blend;
                bodyDirY += (relUy - bodyDirY) * blend;
                bodyDirZ += (relUz - bodyDirZ) * blend;
                // Re-normalize
                const bLen = Math.sqrt(bodyDirX ** 2 + bodyDirY ** 2 + bodyDirZ ** 2);
                if (bLen > 0.001) {
                    bodyDirX /= bLen; bodyDirY /= bLen; bodyDirZ /= bLen;
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
        const accelX = forceX / state.mass;
        const accelY = forceY / state.mass;
        const accelZ = forceZ / state.mass;
        const totalAccel = Math.sqrt(accelX ** 2 + accelY ** 2 + accelZ ** 2);

        // Integration (Velocity Verlet / semi-implicit Euler)
        state.velX += accelX * dt;
        state.velY += accelY * dt;
        state.velZ += accelZ * dt;

        state.posX += state.velX * dt;
        state.posY += state.velY * dt;
        state.posZ += state.velZ * dt;

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
                    rs.deployed = true;
                }
            } else if (rs.deployEvent === 'timer') {
                // Timer starts at motor burnout
                if (state.motorBurnedOut && state.time >= burnoutTime + rs.deployDelay) {
                    rs.deployed = true;
                }
            }

            // Fire event when newly deployed
            if (rs.deployed) {
                state.recoveryDeployed = true;
                const spd = Math.sqrt(state.velX ** 2 + state.velY ** 2 + state.velZ ** 2);
                if (deploymentVelocity === 0) deploymentVelocity = spd;
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
        if (state.posY <= groundAlt && state.time > 0.5) {
            const hitSpeed = Math.sqrt(state.velX ** 2 + state.velY ** 2 + state.velZ ** 2);
            groundHitVelocity = hitSpeed;
            state.posY = groundAlt;
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
