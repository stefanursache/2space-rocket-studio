import { SimulationResult } from '../types/rocket';

export interface FlightDataMismatch {
    row: number;
    column: string;
    expected: number;
    actual: number;
    tolerance: number;
}

export interface OpenRocketFlightReference {
    metrics: Record<string, number>;
    columns: string[];
    rows: Array<Record<string, string>>;
}

export function parseOpenRocketXmlFlightData(xml: string): OpenRocketFlightReference {
    const flightdata = xml.match(/<flightdata\b([^>]*)>/i);
    if (!flightdata) throw new Error('OpenRocket XML does not contain a flightdata element.');
    const metrics: Record<string, number> = {};
    for (const match of flightdata[1].matchAll(/([\w]+)="([^"]+)"/g)) {
        const value = Number(match[2]);
        if (Number.isFinite(value)) metrics[match[1]] = value;
    }

    const branch = xml.match(/<databranch\b[^>]*types="([^"]*)"[^>]*>([\s\S]*?)<\/databranch>/i);
    if (!branch) return { metrics, columns: [], rows: [] };
    const columns = branch[1].split(',').map(value => value.trim());
    const rows = Array.from(branch[2].matchAll(/<datapoint>([^<]*)<\/datapoint>/gi))
        .map(match => {
            const values = match[1].split(',');
            return Object.fromEntries(columns.map((column, index) => [column, values[index]?.trim() ?? '']));
        });
    return { metrics, columns, rows };
}

export function parseOpenRocketFlightCsv(csv: string): Array<Record<string, string>> {
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const parseRow = (line: string): string[] => {
        const values: string[] = [];
        let value = '';
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (quoted && line[i + 1] === '"') {
                    value += '"';
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (char === ',' && !quoted) {
                values.push(value.trim());
                value = '';
            } else {
                value += char;
            }
        }
        values.push(value.trim());
        return values;
    };
    const headers = parseRow(lines[0]);
    return lines.slice(1).map(line => {
        const values = parseRow(line);
        return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
    });
}

export function compareFlightDataCsv(
    result: SimulationResult,
    csv: string,
    columns: Record<string, keyof SimulationResult['data'][number]>,
    tolerance: number,
): FlightDataMismatch[] {
    const rows = parseOpenRocketFlightCsv(csv);
    const mismatches: FlightDataMismatch[] = [];
    rows.forEach((row, rowIndex) => {
        if (result.data.length === 0) return;
        const time = Number(row.Time ?? row.time ?? row['Time (s)']);
        const actualPoint = Number.isFinite(time)
            ? result.data.reduce((closest, point) =>
                Math.abs(point.time - time) < Math.abs(closest.time - time) ? point : closest,
            result.data[0])
            : result.data[rowIndex];
        if (!actualPoint) return;
        Object.entries(columns).forEach(([csvColumn, resultColumn]) => {
            const expected = Number(row[csvColumn]);
            const actual = Number(actualPoint[resultColumn]);
            if (Number.isFinite(expected) && (!Number.isFinite(actual) || Math.abs(expected - actual) > tolerance)) {
                mismatches.push({ row: rowIndex, column: csvColumn, expected, actual, tolerance });
            }
        });
    });
    return mismatches;
}
