import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { importOrkFile } from '../src/services/orkImporter';
import { runSimulation, getDefaultSimulationOptions } from '../src/physics/simulation';
import { SimulationOptions, Motor } from '../src/types/rocket';

const orkPath = process.argv[2];
const engPath = process.argv[3];
if (!orkPath || !engPath) {
    throw new Error('Usage: npm run compare:openrocket -- <design.ork> <motor.eng>');
}

const originalDomParser = globalThis.DOMParser;
globalThis.DOMParser = new JSDOM('').window.DOMParser as typeof DOMParser;
const orkBuffer = await readFile(orkPath);
const eng = await readFile(engPath, 'utf8');
const imported = await importOrkFile(orkBuffer.buffer.slice(orkBuffer.byteOffset, orkBuffer.byteOffset + orkBuffer.byteLength));
if (originalDomParser) globalThis.DOMParser = originalDomParser;

const lines = eng.trim().split(/\r?\n/).filter(Boolean);
const header = lines[0].trim().split(/\s+/);
const thrustCurve = lines.slice(1).map(line => {
    const [time, thrust] = line.trim().split(/\s+/).map(Number);
    return [time, thrust] as [number, number];
});
const integrate = (curve: [number, number][]) => curve.slice(0, -1)
    .reduce((sum, point, index) => sum + (point[1] + curve[index + 1][1]) *
        (curve[index + 1][0] - point[0]) / 2, 0);
const totalImpulse = integrate(thrustCurve);
const motor: Motor = {
    id: 'uploaded-o5500x-ps',
    manufacturer: 'AeroTech',
    designation: header[0],
    commonName: header[0],
    diameter: Number(header[1]),
    length: Number(header[2]),
    delays: 'none',
    propellantMass: Number(header[4]),
    totalMass: Number(header[5]),
    averageThrust: totalImpulse / thrustCurve[thrustCurve.length - 1][0],
    maxThrust: Math.max(...thrustCurve.map(point => point[1])),
    burnTime: thrustCurve[thrustCurve.length - 1][0],
    totalImpulse,
    impulseClass: 'O',
    thrustCurve,
};

const reference = imported.flightReference;
if (!reference) throw new Error('No embedded OpenRocket flight reference found.');
const defaults: SimulationOptions = {
    ...getDefaultSimulationOptions(),
    ...imported.simulationOptions,
    motorConfigId: 'uploaded-o5500x-ps',
    windSpeedStdDev: imported.simulationOptions?.windSpeedStdDev ?? 0,
    maxTime: Math.max(imported.simulationOptions?.maxTime ?? 0, reference.flightTime + 1),
};
const result = runSimulation(imported.rocket, motor, defaults);

const comparisons = [
    ['maxAltitude', reference.maxAltitude, result.maxAltitude, 'm'],
    ['maxVelocity', reference.maxVelocity, result.maxVelocity, 'm/s'],
    ['maxAcceleration', reference.maxAcceleration, result.maxAcceleration, 'm/s²'],
    ['maxMach', reference.maxMach, result.maxMach, 'Mach'],
    ['timeToApogee', reference.timeToApogee, result.timeToApogee, 's'],
    ['flightTime', reference.flightTime, result.flightTime, 's'],
    ['groundHitVelocity', reference.groundHitVelocity, result.groundHitVelocity, 'm/s'],
    ['launchRodVelocity', reference.launchRodVelocity, result.launchRodVelocity, 'm/s'],
    ['deploymentVelocity', reference.deploymentVelocity, result.deploymentVelocity, 'm/s'],
] as const;
console.log(`Motor ${motor.designation}: ${motor.totalImpulse.toFixed(1)} Ns, ${motor.burnTime.toFixed(3)} s, ${motor.totalMass.toFixed(3)} kg`);
const recoveryEvents = result.events.filter(event => event.type === 'deployment' || event.type === 'groundhit');
for (const event of recoveryEvents) console.log(`event,${event.type},${event.time.toFixed(3)},${event.description}`);
const finalPoint = result.data[result.data.length - 1];
console.log(`finalState,mass=${finalPoint?.totalMass.toFixed(3)},altitude=${finalPoint?.altitude.toFixed(3)},velocity=${finalPoint?.velocity.toFixed(3)}`);
console.log('metric,openrocket,2space,delta,relativePercent,unit');
for (const [name, expected, actual, unit] of comparisons) {
    const delta = actual - expected;
    const relative = expected !== 0 ? delta / expected * 100 : 0;
    console.log(`${name},${expected},${actual},${delta},${relative},${unit}`);
}
