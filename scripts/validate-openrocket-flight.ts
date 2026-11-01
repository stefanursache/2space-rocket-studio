import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseOpenRocketFlightCsv, parseOpenRocketXmlFlightData } from '../src/physics/flightDataValidation';

const filename = process.argv[2] || 'src/physics/fixtures/openrocket-flight.csv';
const isOrk = filename.toLowerCase().endsWith('.ork');
const execFileAsync = promisify(execFile);
const xml = isOrk
    ? (await execFileAsync('unzip', ['-p', filename, 'rocket.ork'])).stdout
    : '';
const csv = isOrk ? '' : await readFile(filename, 'utf8');
if (isOrk) {
    const reference = parseOpenRocketXmlFlightData(xml);
    if (reference.rows.length === 0) {
        throw new Error(`OpenRocket file contains no embedded flight datapoints: ${filename}`);
    }
    const required = ['Time', 'Altitude', 'Total velocity'];
    const missing = required.filter(column => !reference.columns.includes(column));
    if (missing.length > 0) {
        throw new Error(`OpenRocket flight branch is missing required columns: ${missing.join(', ')}`);
    }
    console.log(
        `Parsed ${reference.rows.length} embedded OpenRocket flight rows from ${filename}. ` +
        `OpenRocket 23.09 reference: altitude ${reference.metrics.maxaltitude} m, ` +
        `velocity ${reference.metrics.maxvelocity} m/s, apogee ${reference.metrics.timetoapogee} s.`,
    );
    process.exit(0);
}
const rows = parseOpenRocketFlightCsv(csv);
const required = ['time', 'altitude', 'velocity'];
const missing = required.filter(column => !csv.split(/\r?\n/, 1)[0].split(',').includes(column));
if (missing.length > 0) {
    throw new Error(`OpenRocket flight CSV is missing required columns: ${missing.join(', ')}`);
}
if (rows.length === 0) {
    throw new Error(`OpenRocket flight CSV contains no data rows: ${filename}`);
}
console.log(`Parsed ${rows.length} OpenRocket flight rows from ${filename}.`);
