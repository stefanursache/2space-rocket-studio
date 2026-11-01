export type FlightEventType =
    | 'launch'
    | 'ignition'
    | 'burnout'
    | 'ejection_charge'
    | 'stage_separation'
    | 'altitude'
    | 'apogee'
    | 'ground_hit'
    | 'deployment';

export interface FlightEvent {
    type: FlightEventType;
    time: number;
    stage?: number;
    motorId?: string;
    altitude?: number;
    source?: string;
}

export class FlightEventQueue {
    private readonly events: FlightEvent[] = [];

    enqueue(event: FlightEvent): void {
        this.events.push(event);
        this.events.sort((a, b) => a.time - b.time);
    }

    peek(): FlightEvent | undefined {
        return this.events[0];
    }

    popReady(time: number, epsilon = 1e-9): FlightEvent[] {
        const ready: FlightEvent[] = [];
        while (this.events.length > 0 && this.events[0].time <= time + epsilon) {
            ready.push(this.events.shift()!);
        }
        return ready;
    }

    nextTime(): number | undefined {
        return this.events[0]?.time;
    }

    clear(): void {
        this.events.length = 0;
    }
}

export type MotorPhase = 'unignited' | 'burning' | 'burned_out' | 'ejection_spent';

export interface MotorRuntimeState {
    motorId: string;
    phase: MotorPhase;
    ignitionTime?: number;
    burnoutTime?: number;
    ejectionTime?: number;
    ignitionDelay: number;
    motorTime: number;
}

export interface StageRuntimeState {
    stage: number;
    active: boolean;
    separated: boolean;
}

export function activateMotor(
    motor: MotorRuntimeState,
    eventTime: number,
): MotorRuntimeState {
    if (motor.phase !== 'unignited') return motor;
    return {
        ...motor,
        phase: 'burning',
        ignitionTime: eventTime,
        burnoutTime: eventTime,
        motorTime: 0,
    };
}

export function updateMotorRuntime(
    motor: MotorRuntimeState,
    simulationTime: number,
    burnTime: number,
): MotorRuntimeState {
    if (motor.ignitionTime === undefined) return motor;
    const motorTime = simulationTime - motor.ignitionTime;
    if (motor.phase === 'burning' && motorTime >= burnTime) {
        return { ...motor, phase: 'burned_out', motorTime };
    }
    return { ...motor, motorTime };
}
