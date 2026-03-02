import { Motor } from '../types/rocket';
import { v4 as uuid } from 'uuid';

// ===========================
// Motor Database
// ===========================
// Representative selection of common Estes, Aerotech, and Cesaroni motors

export const MOTOR_DATABASE: Motor[] = [
    // === A Class ===
    {
        id: uuid(), manufacturer: 'Estes', designation: 'A8-3', commonName: 'A8',
        diameter: 18, length: 70, delays: '3,5', propellantMass: 0.00312,
        totalMass: 0.0164, averageThrust: 4.26, maxThrust: 9.73, burnTime: 0.59,
        totalImpulse: 2.5, impulseClass: 'A',
        thrustCurve: [[0, 0], [0.015, 1.02], [0.04, 5.44], [0.06, 7.48], [0.1, 9.73], [0.15, 8.84], [0.2, 7.48], [0.3, 4.42], [0.4, 2.04], [0.5, 0.68], [0.59, 0]]
    },
    // === B Class ===
    {
        id: uuid(), manufacturer: 'Estes', designation: 'B4-4', commonName: 'B4',
        diameter: 18, length: 70, delays: '2,4,6', propellantMass: 0.00625,
        totalMass: 0.0198, averageThrust: 4.26, maxThrust: 12.3, burnTime: 1.17,
        totalImpulse: 5.0, impulseClass: 'B',
        thrustCurve: [[0, 0], [0.02, 2.1], [0.05, 8.5], [0.1, 12.3], [0.2, 10.5], [0.35, 6.8], [0.5, 4.2], [0.7, 2.5], [0.9, 1.2], [1.1, 0.5], [1.17, 0]]
    },
    {
        id: uuid(), manufacturer: 'Estes', designation: 'B6-4', commonName: 'B6',
        diameter: 18, length: 70, delays: '0,2,4,6', propellantMass: 0.00625,
        totalMass: 0.0198, averageThrust: 5.26, maxThrust: 12.14, burnTime: 0.95,
        totalImpulse: 5.0, impulseClass: 'B',
        thrustCurve: [[0, 0], [0.025, 3.5], [0.05, 9.8], [0.1, 12.14], [0.15, 10.2], [0.25, 7.5], [0.4, 5.0], [0.6, 3.0], [0.8, 1.5], [0.95, 0]]
    },
    // === C Class ===
    {
        id: uuid(), manufacturer: 'Estes', designation: 'C6-3', commonName: 'C6',
        diameter: 18, length: 70, delays: '0,3,5,7', propellantMass: 0.0125,
        totalMass: 0.0240, averageThrust: 5.88, maxThrust: 14.09, burnTime: 1.70,
        totalImpulse: 10.0, impulseClass: 'C',
        thrustCurve: [[0, 0], [0.031, 0.946], [0.092, 6.23], [0.119, 7.67], [0.162, 10.5], [0.231, 13.0], [0.3, 14.09], [0.415, 12.1], [0.554, 8.31], [0.738, 5.54], [0.969, 3.94], [1.2, 2.69], [1.4, 1.62], [1.6, 0.66], [1.7, 0]]
    },
    {
        id: uuid(), manufacturer: 'Estes', designation: 'C11-3', commonName: 'C11',
        diameter: 24, length: 70, delays: '3,5,7', propellantMass: 0.0125,
        totalMass: 0.0289, averageThrust: 11.20, maxThrust: 21.8, burnTime: 0.89,
        totalImpulse: 10.0, impulseClass: 'C',
        thrustCurve: [[0, 0], [0.024, 5.0], [0.05, 15.5], [0.1, 21.8], [0.15, 19.0], [0.25, 14.5], [0.4, 10.0], [0.55, 7.0], [0.7, 4.0], [0.85, 1.5], [0.89, 0]]
    },
    // === D Class ===
    {
        id: uuid(), manufacturer: 'Estes', designation: 'D12-3', commonName: 'D12',
        diameter: 24, length: 70, delays: '0,3,5,7', propellantMass: 0.0218,
        totalMass: 0.0441, averageThrust: 11.80, maxThrust: 29.72, burnTime: 1.70,
        totalImpulse: 20.0, impulseClass: 'D',
        thrustCurve: [[0, 0], [0.028, 2.89], [0.054, 15.8], [0.08, 28.3], [0.12, 29.72], [0.16, 27.5], [0.24, 22.5], [0.35, 16.2], [0.5, 10.8], [0.7, 7.5], [0.95, 5.0], [1.2, 3.2], [1.5, 1.5], [1.7, 0]]
    },
    // === E Class ===
    {
        id: uuid(), manufacturer: 'Estes', designation: 'E9-4', commonName: 'E9',
        diameter: 24, length: 95, delays: '4,6,8', propellantMass: 0.0312,
        totalMass: 0.0567, averageThrust: 9.04, maxThrust: 19.54, burnTime: 3.45,
        totalImpulse: 31.2, impulseClass: 'E',
        thrustCurve: [[0, 0], [0.04, 3.5], [0.1, 12.0], [0.2, 19.54], [0.35, 16.0], [0.6, 12.5], [1.0, 9.0], [1.5, 7.0], [2.0, 5.5], [2.5, 4.0], [3.0, 2.5], [3.4, 1.0], [3.45, 0]]
    },
    {
        id: uuid(), manufacturer: 'Estes', designation: 'E12-4', commonName: 'E12',
        diameter: 24, length: 95, delays: '4,6,8', propellantMass: 0.0312,
        totalMass: 0.0567, averageThrust: 12.38, maxThrust: 26.5, burnTime: 2.52,
        totalImpulse: 31.2, impulseClass: 'E',
        thrustCurve: [[0, 0], [0.03, 5.0], [0.08, 18.0], [0.15, 26.5], [0.25, 23.0], [0.4, 18.0], [0.7, 14.0], [1.0, 11.0], [1.4, 8.0], [1.8, 5.5], [2.2, 3.0], [2.5, 1.0], [2.52, 0]]
    },
    // === F Class ===
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'F15-4', commonName: 'F15',
        diameter: 24, length: 95, delays: '4,6,8', propellantMass: 0.0326,
        totalMass: 0.0610, averageThrust: 15.44, maxThrust: 28.3, burnTime: 2.52,
        totalImpulse: 38.9, impulseClass: 'F',
        thrustCurve: [[0, 0], [0.03, 5.5], [0.08, 20.0], [0.14, 28.3], [0.25, 24.0], [0.4, 19.5], [0.65, 16.0], [1.0, 13.5], [1.4, 11.0], [1.8, 8.0], [2.1, 5.0], [2.4, 2.5], [2.52, 0]]
    },
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'F39-6', commonName: 'F39',
        diameter: 24, length: 95, delays: '6,9,12', propellantMass: 0.0303,
        totalMass: 0.0551, averageThrust: 39.0, maxThrust: 58.6, burnTime: 1.00,
        totalImpulse: 39.0, impulseClass: 'F',
        thrustCurve: [[0, 0], [0.02, 10.0], [0.05, 40.0], [0.08, 58.6], [0.12, 55.0], [0.2, 48.0], [0.35, 40.0], [0.5, 32.0], [0.7, 22.0], [0.85, 12.0], [0.95, 5.0], [1.0, 0]]
    },
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'F50-6', commonName: 'F50',
        diameter: 24, length: 124, delays: '4,6,9', propellantMass: 0.0440,
        totalMass: 0.0760, averageThrust: 50.7, maxThrust: 73.2, burnTime: 1.56,
        totalImpulse: 79.0, impulseClass: 'F',
        thrustCurve: [[0, 0], [0.02, 15.0], [0.05, 50.0], [0.08, 73.2], [0.12, 68.0], [0.2, 60.0], [0.4, 52.0], [0.6, 45.0], [0.9, 35.0], [1.1, 25.0], [1.3, 15.0], [1.5, 5.0], [1.56, 0]]
    },
    // === G Class ===
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'G40-7', commonName: 'G40',
        diameter: 29, length: 124, delays: '4,7,10', propellantMass: 0.0625,
        totalMass: 0.1021, averageThrust: 40.2, maxThrust: 65.3, burnTime: 2.50,
        totalImpulse: 100.6, impulseClass: 'G',
        thrustCurve: [[0, 0], [0.03, 12.0], [0.08, 45.0], [0.13, 65.3], [0.2, 58.0], [0.4, 48.0], [0.7, 42.0], [1.0, 38.0], [1.4, 33.0], [1.8, 27.0], [2.1, 18.0], [2.35, 8.0], [2.5, 0]]
    },
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'G76-7', commonName: 'G76',
        diameter: 29, length: 124, delays: '4,7,10', propellantMass: 0.0546,
        totalMass: 0.0926, averageThrust: 76.2, maxThrust: 118.0, burnTime: 1.32,
        totalImpulse: 100.6, impulseClass: 'G',
        thrustCurve: [[0, 0], [0.02, 20.0], [0.05, 75.0], [0.08, 118.0], [0.12, 108.0], [0.2, 95.0], [0.35, 82.0], [0.5, 72.0], [0.7, 58.0], [0.9, 42.0], [1.1, 25.0], [1.25, 10.0], [1.32, 0]]
    },
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'G80-7', commonName: 'G80',
        diameter: 29, length: 194, delays: '4,7,10', propellantMass: 0.0813,
        totalMass: 0.1344, averageThrust: 80.0, maxThrust: 120.0, burnTime: 1.60,
        totalImpulse: 128.0, impulseClass: 'G',
        thrustCurve: [[0, 0], [0.02, 20.0], [0.05, 80.0], [0.08, 120.0], [0.15, 110.0], [0.3, 92.0], [0.5, 82.0], [0.7, 74.0], [1.0, 60.0], [1.2, 42.0], [1.4, 22.0], [1.55, 8.0], [1.6, 0]]
    },
    // === H Class ===
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'H128-10', commonName: 'H128',
        diameter: 29, length: 194, delays: '6,10,14', propellantMass: 0.0923,
        totalMass: 0.1536, averageThrust: 128.0, maxThrust: 188.5, burnTime: 1.57,
        totalImpulse: 200.9, impulseClass: 'H',
        thrustCurve: [[0, 0], [0.015, 30.0], [0.04, 120.0], [0.07, 188.5], [0.12, 175.0], [0.2, 155.0], [0.4, 135.0], [0.6, 118.0], [0.9, 95.0], [1.1, 68.0], [1.3, 40.0], [1.5, 15.0], [1.57, 0]]
    },
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'H180-10', commonName: 'H180',
        diameter: 29, length: 194, delays: '6,10,14', propellantMass: 0.0830,
        totalMass: 0.1465, averageThrust: 180.0, maxThrust: 255.0, burnTime: 1.11,
        totalImpulse: 199.8, impulseClass: 'H',
        thrustCurve: [[0, 0], [0.01, 40.0], [0.03, 160.0], [0.05, 255.0], [0.08, 240.0], [0.15, 215.0], [0.3, 190.0], [0.5, 165.0], [0.7, 130.0], [0.85, 90.0], [1.0, 45.0], [1.1, 10.0], [1.11, 0]]
    },
    {
        id: uuid(), manufacturer: 'Cesaroni', designation: 'H100-10', commonName: 'H100',
        diameter: 29, length: 228, delays: '6,8,10,12,14', propellantMass: 0.0844,
        totalMass: 0.1534, averageThrust: 100.0, maxThrust: 157.0, burnTime: 1.90,
        totalImpulse: 190.0, impulseClass: 'H',
        thrustCurve: [[0, 0], [0.02, 25.0], [0.06, 110.0], [0.1, 157.0], [0.18, 140.0], [0.35, 120.0], [0.6, 105.0], [0.9, 92.0], [1.2, 76.0], [1.5, 55.0], [1.7, 32.0], [1.85, 12.0], [1.9, 0]]
    },
    // === I Class ===
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'I200-10', commonName: 'I200',
        diameter: 38, length: 228, delays: '6,10,14', propellantMass: 0.1470,
        totalMass: 0.2630, averageThrust: 200.0, maxThrust: 310.0, burnTime: 2.05,
        totalImpulse: 410.0, impulseClass: 'I',
        thrustCurve: [[0, 0], [0.02, 50.0], [0.05, 180.0], [0.08, 310.0], [0.14, 285.0], [0.3, 240.0], [0.6, 210.0], [0.9, 185.0], [1.2, 155.0], [1.5, 118.0], [1.7, 78.0], [1.9, 35.0], [2.05, 0]]
    },
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'I284-10', commonName: 'I284',
        diameter: 38, length: 228, delays: '6,10,14', propellantMass: 0.1700,
        totalMass: 0.2820, averageThrust: 284.0, maxThrust: 403.0, burnTime: 1.48,
        totalImpulse: 420.3, impulseClass: 'I',
        thrustCurve: [[0, 0], [0.015, 60.0], [0.04, 250.0], [0.07, 403.0], [0.12, 380.0], [0.25, 320.0], [0.4, 290.0], [0.6, 260.0], [0.8, 220.0], [1.0, 170.0], [1.2, 105.0], [1.35, 50.0], [1.48, 0]]
    },
    // === J Class ===
    {
        id: uuid(), manufacturer: 'Aerotech', designation: 'J350-14', commonName: 'J350',
        diameter: 38, length: 368, delays: '6,10,14', propellantMass: 0.3270,
        totalMass: 0.5110, averageThrust: 350.0, maxThrust: 505.0, burnTime: 2.36,
        totalImpulse: 826.0, impulseClass: 'J',
        thrustCurve: [[0, 0], [0.02, 80.0], [0.06, 320.0], [0.1, 505.0], [0.18, 470.0], [0.4, 400.0], [0.7, 360.0], [1.0, 330.0], [1.3, 290.0], [1.6, 240.0], [1.9, 175.0], [2.1, 100.0], [2.3, 40.0], [2.36, 0]]
    },
    // === K Class ===
    {
        id: uuid(), manufacturer: 'Cesaroni', designation: 'K510-14', commonName: 'K510',
        diameter: 54, length: 403, delays: '6,8,10,12,14', propellantMass: 0.6550,
        totalMass: 1.0900, averageThrust: 510.0, maxThrust: 775.0, burnTime: 2.78,
        totalImpulse: 1417.8, impulseClass: 'K',
        thrustCurve: [[0, 0], [0.02, 100.0], [0.06, 440.0], [0.1, 775.0], [0.2, 720.0], [0.45, 600.0], [0.8, 530.0], [1.2, 480.0], [1.6, 420.0], [2.0, 340.0], [2.3, 230.0], [2.5, 130.0], [2.7, 50.0], [2.78, 0]]
    },
];

export function getMotorById(id: string): Motor | undefined {
    return MOTOR_DATABASE.find(m => m.id === id);
}

export function getMotorsByClass(impulseClass: string): Motor[] {
    return MOTOR_DATABASE.filter(m => m.impulseClass === impulseClass);
}

export function getMotorsByDiameter(diameter: number): Motor[] {
    return MOTOR_DATABASE.filter(m => m.diameter === diameter);
}

export function getAvailableMotorClasses(): string[] {
    const classes = new Set(MOTOR_DATABASE.map(m => m.impulseClass));
    return Array.from(classes).sort();
}

export function getAvailableDiameters(): number[] {
    const diameters = new Set(MOTOR_DATABASE.map(m => m.diameter));
    return Array.from(diameters).sort((a, b) => a - b);
}

export function interpolateThrust(motor: Motor, time: number): number {
    const curve = motor.thrustCurve;
    if (time < 0 || time > motor.burnTime || curve.length === 0) return 0;

    // Before or at first data point
    if (time <= curve[0][0]) return curve[0][1];
    // After or at last data point
    if (time >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];

    for (let i = 0; i < curve.length - 1; i++) {
        if (time >= curve[i][0] && time <= curve[i + 1][0]) {
            const dt = curve[i + 1][0] - curve[i][0];
            if (dt === 0) return curve[i][1];
            const t = (time - curve[i][0]) / dt;
            return curve[i][1] + t * (curve[i + 1][1] - curve[i][1]);
        }
    }
    return 0;
}
