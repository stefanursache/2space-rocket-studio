// ============================================================
// OpenRocket .ork File Importer
// Parses .ork files (XML or ZIP-wrapped XML) into the app's
// Rocket / Motor / SimulationOptions types.
// ============================================================

import { v4 as uuid } from 'uuid';
import {
    Rocket, NoseCone, BodyTube, Transition, TrapezoidFinSet,
    Parachute, Streamer, ShockCord, MassObject, InnerTube,
    EngineBlock, CenteringRing, Bulkhead, LaunchLug, TubeCoupler,
    Motor, SimulationOptions, RocketComponent, Stage,
    NoseConeShape, FinCrossSection, SurfaceFinish, Material,
} from '../types/rocket';
import {
    createNoseCone, createBodyTube, createTransition, createTrapezoidFinSet,
    createParachute, createStreamer, createShockCord, createMassObject,
    createInnerTube, createEngineBlock, createCenteringRing, createBulkhead,
    createLaunchLug, createTubeCoupler, createStage,
} from '../models/components';

// ---- Utility helpers -----------------------------------------------

/** Get the text content of a direct child element by tag name */
function getText(el: Element, tag: string): string | null {
    const child = el.querySelector(':scope > ' + tag);
    return child ? child.textContent?.trim() ?? null : null;
}

/** Get a float from a child element, with fallback */
function getFloat(el: Element, tag: string, fallback: number = 0): number {
    const t = getText(el, tag);
    if (t === null || t === '' || t === 'NaN' || t === 'none') return fallback;
    // Handle 'auto' values like "auto 0.068"
    const clean = t.replace(/^auto\s*/, '');
    const v = parseFloat(clean);
    return isNaN(v) ? fallback : v;
}

/** Map ork finish names to our SurfaceFinish type */
function mapFinish(val: string | null): SurfaceFinish {
    const map: Record<string, SurfaceFinish> = {
        unfinished: 'unfinished', rough: 'rough',
        normal: 'regular_paint', smooth: 'smooth_paint',
        polished: 'polished',
    };
    return (val && map[val]) || 'regular_paint';
}

/** Map ork nose cone shapes to our NoseConeShape type */
function mapNoseShape(val: string | null): NoseConeShape {
    const map: Record<string, NoseConeShape> = {
        conical: 'conical', ogive: 'ogive', ellipsoid: 'ellipsoid',
        power: 'power', parabolic: 'parabolic', haack: 'haack',
        vonkarman: 'haack',
    };
    return (val && map[val.toLowerCase()]) || 'ogive';
}

/** Map ork fin cross-section */
function mapCrossSection(val: string | null): FinCrossSection {
    const map: Record<string, FinCrossSection> = {
        square: 'square', rounded: 'rounded', airfoil: 'airfoil', wedge: 'wedge',
    };
    return (val && map[val.toLowerCase()]) || 'rounded';
}

/** Parse material element */
function parseMaterial(el: Element, tag: string = 'material'): Material | null {
    const matEl = el.querySelector(':scope > ' + tag);
    if (!matEl) return null;
    return {
        name: matEl.textContent?.trim() || 'Unknown',
        density: parseFloat(matEl.getAttribute('density') || '0'),
        type: (matEl.getAttribute('type') as Material['type']) || 'bulk',
    };
}

/** Map deploy events */
function mapDeployEvent(val: string | null): 'apogee' | 'altitude' | 'timer' {
    if (val === 'altitude') return 'altitude';
    if (val === 'never' || val === 'timer' || val === 'ejection') return 'timer';
    return 'apogee'; // default
}

// ---- Position resolution -------------------------------------------

/**
 * Get the "length" (axial extent) of a parsed component so we can
 * resolve position offsets that reference the child's own bottom or middle.
 */
function getChildLength(comp: RocketComponent): number {
    switch (comp.type) {
        case 'bodytube': return comp.length;
        case 'nosecone': return comp.length;
        case 'transition': return comp.length;
        case 'innertube': return comp.length;
        case 'engineblock': return comp.length;
        case 'centeringring': return comp.length;
        case 'bulkhead': return comp.length;
        case 'tubecoupler': return comp.length;
        case 'trapezoidfinset': return comp.rootChord;
        case 'ellipticalfinset': return comp.rootChord;
        case 'freeformfinset': return 0;
        case 'massobject': return comp.length;
        case 'parachute': return 0;
        case 'streamer': return 0;
        case 'shockcord': return 0;
        case 'launchlug': return comp.length;
        default: return 0;
    }
}

/**
 * Resolve the OpenRocket axialoffset / position element into a
 * top-relative position (distance from parent's front to child's front).
 *
 * OpenRocket position methods:
 *   method="top"    → child's FRONT is at parent's FRONT + value
 *   method="middle" → child's CENTER is at parent's CENTER + value
 *   method="bottom" → child's BOTTOM is at parent's BOTTOM + value
 *   method="absolute" → absolute from rocket nose tip (stage-level only)
 */
function resolvePosition(el: Element, comp: RocketComponent, parentLength: number): void {
    const posEl = el.querySelector(':scope > axialoffset') || el.querySelector(':scope > position');
    if (!posEl) return;

    const method = posEl.getAttribute('method') || posEl.getAttribute('type') || 'top';
    const posVal = parseFloat(posEl.textContent || '0') || 0;
    const childLen = getChildLength(comp);

    let topRelative = 0;
    switch (method) {
        case 'top':
            topRelative = posVal;
            break;
        case 'middle':
            // child's center at parent's center + value
            topRelative = (parentLength - childLen) / 2 + posVal;
            break;
        case 'bottom':
            // child's bottom at parent's bottom + value
            topRelative = parentLength + posVal - childLen;
            break;
        case 'absolute':
            topRelative = posVal;
            break;
        default:
            topRelative = posVal;
    }

    // Clamp to valid range (allow slightly past ends for overhang)
    topRelative = Math.max(0, topRelative);

    if ('position' in comp) {
        (comp as any).position = topRelative;
    }
}

// ---- Component parsers ---------------------------------------------

function parseNoseCone(el: Element): NoseCone {
    const nc = createNoseCone();
    nc.name = getText(el, 'name') || nc.name;
    nc.shape = mapNoseShape(getText(el, 'shape'));
    nc.shapeParameter = getFloat(el, 'shapeparameter', 1.0);
    nc.length = getFloat(el, 'length', nc.length);
    nc.thickness = getFloat(el, 'thickness', nc.thickness);
    nc.baseRadius = getFloat(el, 'aftradius', nc.baseRadius);
    nc.shoulderLength = getFloat(el, 'aftshoulderlength', nc.shoulderLength);
    nc.shoulderRadius = getFloat(el, 'aftshoulderradius', nc.shoulderRadius);
    nc.shoulderThickness = getFloat(el, 'aftshoulderthickness', nc.shoulderThickness);
    nc.finish = mapFinish(getText(el, 'finish'));

    const mat = parseMaterial(el);
    if (mat) nc.material = mat;

    // Mass override
    const overMass = getFloat(el, 'overridemass', -1);
    if (overMass > 0) {
        nc.massOverridden = true;
        nc.mass = overMass;
    }

    // Parse children (mass components, etc. inside the nose cone)
    nc.children = parseSubcomponents(el, nc.length);

    return nc;
}

function parseBodyTube(el: Element): BodyTube {
    const bt = createBodyTube();
    bt.name = getText(el, 'name') || bt.name;
    bt.length = getFloat(el, 'length', bt.length);
    bt.outerRadius = getFloat(el, 'radius', bt.outerRadius);
    bt.innerRadius = bt.outerRadius - getFloat(el, 'thickness', 0.003);
    bt.finish = mapFinish(getText(el, 'finish'));

    const mat = parseMaterial(el);
    if (mat) bt.material = mat;

    // Motor mount?
    const mmEl = el.querySelector(':scope > motormount');
    if (mmEl) {
        bt.isMotorMount = true;
        bt.motorOverhang = getFloat(mmEl, 'overhang', 0.005);
    }

    // Mass override
    const overMass = getFloat(el, 'overridemass', -1);
    if (overMass > 0) {
        bt.massOverridden = true;
        bt.mass = overMass;
    }

    // Parse children
    bt.children = parseSubcomponents(el, bt.length);

    return bt;
}

function parseTransition(el: Element): Transition {
    const tr = createTransition();
    tr.name = getText(el, 'name') || tr.name;
    tr.length = getFloat(el, 'length', tr.length);
    tr.foreRadius = getFloat(el, 'foreradius', tr.foreRadius);
    tr.aftRadius = getFloat(el, 'aftradius', tr.aftRadius);
    tr.thickness = getFloat(el, 'thickness', tr.thickness);
    tr.shape = mapNoseShape(getText(el, 'shape'));
    tr.shapeParameter = getFloat(el, 'shapeparameter', 1.0);
    tr.shoulderLength = getFloat(el, 'foreshoulderlength', 0);
    tr.shoulderRadius = getFloat(el, 'foreshoulderradius', 0);
    tr.finish = mapFinish(getText(el, 'finish'));

    const mat = parseMaterial(el);
    if (mat) tr.material = mat;

    return tr;
}

function parseTrapezoidFinSet(el: Element): TrapezoidFinSet {
    const fs = createTrapezoidFinSet();
    fs.name = getText(el, 'name') || fs.name;
    fs.finCount = getFloat(el, 'fincount', getFloat(el, 'instancecount', fs.finCount));
    fs.rootChord = getFloat(el, 'rootchord', fs.rootChord);
    fs.tipChord = getFloat(el, 'tipchord', fs.tipChord);
    fs.height = getFloat(el, 'height', fs.height);
    fs.sweepLength = getFloat(el, 'sweeplength', fs.sweepLength);
    fs.thickness = getFloat(el, 'thickness', fs.thickness);
    fs.crossSection = mapCrossSection(getText(el, 'crosssection'));
    fs.cantAngle = getFloat(el, 'cant', 0);
    fs.finish = mapFinish(getText(el, 'finish'));

    const mat = parseMaterial(el);
    if (mat) fs.material = mat;

    // Position will be resolved by resolvePosition() in parseSubcomponents

    return fs;
}

function parseParachute(el: Element): Parachute {
    const ch = createParachute();
    ch.name = getText(el, 'name') || ch.name;
    ch.diameter = getFloat(el, 'diameter', ch.diameter);
    ch.cd = getFloat(el, 'cd', ch.cd);
    ch.lineCount = getFloat(el, 'linecount', ch.lineCount);
    ch.lineLength = getFloat(el, 'linelength', ch.lineLength);
    ch.deployEvent = mapDeployEvent(getText(el, 'deployevent'));
    ch.deployAltitude = getFloat(el, 'deployaltitude', ch.deployAltitude);
    ch.deployDelay = getFloat(el, 'deploydelay', ch.deployDelay);

    const mat = parseMaterial(el);
    if (mat) ch.material = mat;

    // Mass override
    const overMass = getFloat(el, 'overridemass', -1);
    if (overMass > 0) {
        ch.massOverridden = true;
        ch.mass = overMass;
    }

    // Position will be resolved by resolvePosition() in parseSubcomponents

    return ch;
}

function parseStreamer(el: Element): Streamer {
    const st = createStreamer();
    st.name = getText(el, 'name') || st.name;
    st.stripLength = getFloat(el, 'striplength', st.stripLength);
    st.stripWidth = getFloat(el, 'stripwidth', st.stripWidth);
    st.cd = getFloat(el, 'cd', st.cd);
    st.deployEvent = mapDeployEvent(getText(el, 'deployevent'));
    st.deployAltitude = getFloat(el, 'deployaltitude', st.deployAltitude);
    st.deployDelay = getFloat(el, 'deploydelay', st.deployDelay);
    return st;
}

function parseShockCord(el: Element): ShockCord {
    const sc = createShockCord();
    sc.name = getText(el, 'name') || sc.name;
    sc.cordLength = getFloat(el, 'cordlength', sc.cordLength);
    return sc;
}

function parseMassComponent(el: Element): MassObject {
    const mo = createMassObject();
    mo.name = getText(el, 'name') || mo.name;
    mo.componentMass = getFloat(el, 'mass', mo.componentMass);
    mo.length = getFloat(el, 'packedlength', mo.length);
    mo.radius = getFloat(el, 'packedradius', mo.radius);
    mo.massOverridden = true;
    mo.mass = mo.componentMass;

    // Position will be resolved by resolvePosition() in parseSubcomponents

    return mo;
}

function parseInnerTube(el: Element): InnerTube {
    const it = createInnerTube();
    it.name = getText(el, 'name') || it.name;
    it.length = getFloat(el, 'length', it.length);
    it.outerRadius = getFloat(el, 'outerradius', it.outerRadius);
    it.innerRadius = getFloat(el, 'innerradius', it.innerRadius);

    const mmEl = el.querySelector(':scope > motormount');
    if (mmEl) {
        it.isMotorMount = true;
        it.motorOverhang = getFloat(mmEl, 'overhang', 0.005);
    }

    // Position will be resolved by resolvePosition() in parseSubcomponents

    it.children = parseSubcomponents(el, it.length);
    return it;
}

function parseEngineBlock(el: Element): EngineBlock {
    const eb = createEngineBlock();
    eb.name = getText(el, 'name') || eb.name;
    eb.length = getFloat(el, 'length', eb.length);
    eb.outerRadius = getFloat(el, 'outerradius', eb.outerRadius);
    eb.innerRadius = getFloat(el, 'innerradius', eb.innerRadius);

    const overMass = getFloat(el, 'overridemass', -1);
    if (overMass > 0) {
        eb.massOverridden = true;
        eb.mass = overMass;
    }

    return eb;
}

function parseCenteringRing(el: Element): CenteringRing {
    const cr = createCenteringRing();
    cr.name = getText(el, 'name') || cr.name;
    cr.length = getFloat(el, 'length', cr.length);
    cr.outerRadius = getFloat(el, 'outerradius', cr.outerRadius);
    cr.innerRadius = getFloat(el, 'innerradius', cr.innerRadius);

    const overMass = getFloat(el, 'overridemass', -1);
    if (overMass > 0) {
        cr.massOverridden = true;
        cr.mass = overMass;
    }

    return cr;
}

function parseBulkhead(el: Element): Bulkhead {
    const bh = createBulkhead();
    bh.name = getText(el, 'name') || bh.name;
    bh.length = getFloat(el, 'length', bh.length);
    bh.outerRadius = getFloat(el, 'outerradius', bh.outerRadius);
    return bh;
}

function parseLaunchLug(el: Element): LaunchLug {
    const ll = createLaunchLug();
    ll.name = getText(el, 'name') || ll.name;
    ll.length = getFloat(el, 'length', ll.length);
    ll.outerRadius = getFloat(el, 'outerdiameter', 0) / 2 || ll.outerRadius;
    ll.innerRadius = getFloat(el, 'innerdiameter', 0) / 2 || ll.innerRadius;
    return ll;
}

function parseTubeCoupler(el: Element): TubeCoupler {
    const tc = createTubeCoupler();
    tc.name = getText(el, 'name') || tc.name;
    tc.length = getFloat(el, 'length', tc.length);
    tc.outerRadius = getFloat(el, 'outerradius', tc.outerRadius);
    tc.innerRadius = getFloat(el, 'innerradius', tc.innerRadius);
    return tc;
}

/** Parse <subcomponents> child elements into our component array.
 *  parentLength is used to resolve position offsets (middle/bottom methods). */
function parseSubcomponents(parentEl: Element, parentLength?: number): RocketComponent[] {
    const subEl = parentEl.querySelector(':scope > subcomponents');
    if (!subEl) return [];

    const pLen = parentLength ?? getFloat(parentEl, 'length', 0);
    const components: RocketComponent[] = [];
    for (const child of Array.from(subEl.children)) {
        const tag = child.tagName.toLowerCase();
        let comp: RocketComponent | null = null;

        switch (tag) {
            case 'nosecone': comp = parseNoseCone(child); break;
            case 'bodytube': comp = parseBodyTube(child); break;
            case 'transition': comp = parseTransition(child); break;
            case 'trapezoidfinset': comp = parseTrapezoidFinSet(child); break;
            // Elliptical fins → import as trapezoidal approximation
            case 'ellipticalfinset': comp = parseTrapezoidFinSet(child); break;
            case 'freeformfinset': comp = parseTrapezoidFinSet(child); break;
            case 'parachute': comp = parseParachute(child); break;
            case 'streamer': comp = parseStreamer(child); break;
            case 'shockcord': comp = parseShockCord(child); break;
            case 'masscomponent': comp = parseMassComponent(child); break;
            case 'innertube': comp = parseInnerTube(child); break;
            case 'engineblock': comp = parseEngineBlock(child); break;
            case 'centeringring': comp = parseCenteringRing(child); break;
            case 'bulkhead': comp = parseBulkhead(child); break;
            case 'launchlug': comp = parseLaunchLug(child); break;
            case 'railbutton': comp = parseLaunchLug(child); break; // treat as lug
            case 'tubecoupler': comp = parseTubeCoupler(child); break;
            case 'stage': break; // handled separately
            default:
                // Unknown component → import as mass object
                console.warn(`[orkImporter] Unknown component type "${tag}", importing as mass object`);
                comp = parseMassComponent(child);
                break;
        }
        if (comp) {
            // Resolve position from axialoffset/position element to top-relative
            resolvePosition(child, comp, pLen);
            components.push(comp);
        }
    }
    return components;
}

// ---- Motor extraction from .ork -----------------------------------

interface OrkMotorInfo {
    manufacturer: string;
    designation: string;
    diameter: number; // meters in ork
    length: number; // meters in ork
    delay: string;
}

function extractMotorInfo(doc: Document): OrkMotorInfo | null {
    // Find the default motor configuration
    const defaultConfigEl = doc.querySelector('motorconfiguration[default="true"]');
    const configId = defaultConfigEl?.getAttribute('configid');

    // Find motor mount elements
    const motorEls = doc.querySelectorAll('motor');
    if (motorEls.length === 0) return null;

    // Prefer motor matching the default config
    let motorEl: Element | null = null;
    if (configId) {
        for (const m of Array.from(motorEls)) {
            if (m.getAttribute('configid') === configId) {
                motorEl = m;
                break;
            }
        }
    }
    // Fallback to the last motor element
    if (!motorEl) motorEl = motorEls[motorEls.length - 1];

    return {
        manufacturer: getText(motorEl, 'manufacturer') || 'Unknown',
        designation: getText(motorEl, 'designation') || 'Unknown',
        diameter: getFloat(motorEl, 'diameter', 0.029),
        length: getFloat(motorEl, 'length', 0.124),
        delay: getText(motorEl, 'delay') || 'none',
    };
}

// ---- Simulation options extraction --------------------------------

function extractSimulationOptions(doc: Document): Partial<SimulationOptions> | null {
    const condEl = doc.querySelector('simulation > conditions');
    if (!condEl) return null;

    return {
        launchRodLength: getFloat(condEl, 'launchrodlength', 1.0),
        launchRodAngle: getFloat(condEl, 'launchrodangle', 5),
        launchRodDirection: getFloat(condEl, 'launchroddirection', 0),
        windSpeedAvg: getFloat(condEl, 'windaverage', 2),
        launchAltitude: getFloat(condEl, 'launchaltitude', 0),
        launchLatitude: getFloat(condEl, 'launchlatitude', 45),
        launchLongitude: getFloat(condEl, 'launchlongitude', -90),
        timeStep: getFloat(condEl, 'timestep', 0.01),
        maxTime: getFloat(condEl, 'maxtime', 300),
    };
}

// ---- Reference flight data ----------------------------------------

export interface OrkFlightReference {
    maxAltitude: number;
    maxVelocity: number;
    maxAcceleration: number;
    maxMach: number;
    timeToApogee: number;
    flightTime: number;
    groundHitVelocity: number;
    launchRodVelocity: number;
    deploymentVelocity: number;
}

function extractFlightData(doc: Document): OrkFlightReference | null {
    const fdEl = doc.querySelector('flightdata');
    if (!fdEl) return null;

    return {
        maxAltitude: parseFloat(fdEl.getAttribute('maxaltitude') || '0'),
        maxVelocity: parseFloat(fdEl.getAttribute('maxvelocity') || '0'),
        maxAcceleration: parseFloat(fdEl.getAttribute('maxacceleration') || '0'),
        maxMach: parseFloat(fdEl.getAttribute('maxmach') || '0'),
        timeToApogee: parseFloat(fdEl.getAttribute('timetoapogee') || '0'),
        flightTime: parseFloat(fdEl.getAttribute('flighttime') || '0'),
        groundHitVelocity: parseFloat(fdEl.getAttribute('groundhitvelocity') || '0'),
        launchRodVelocity: parseFloat(fdEl.getAttribute('launchrodvelocity') || '0'),
        deploymentVelocity: parseFloat(fdEl.getAttribute('deploymentvelocity') || '0'),
    };
}

// ---- Top-level import function ------------------------------------

export interface OrkImportResult {
    rocket: Rocket;
    motorInfo: OrkMotorInfo | null;
    simulationOptions: Partial<SimulationOptions> | null;
    flightReference: OrkFlightReference | null;
    warnings: string[];
}

/**
 * Import an .ork file (XML string or ZIP ArrayBuffer).
 * Returns the parsed rocket design, motor info, and sim conditions.
 */
export async function importOrkFile(fileContent: string | ArrayBuffer): Promise<OrkImportResult> {
    let xmlString: string;
    const warnings: string[] = [];

    if (typeof fileContent === 'string') {
        xmlString = fileContent;
    } else {
        // Check if it's a ZIP file (starts with PK)
        const bytes = new Uint8Array(fileContent);
        if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
            // ZIP file — try to extract the XML
            xmlString = await extractXmlFromZip(fileContent);
        } else {
            // Plain XML in ArrayBuffer
            xmlString = new TextDecoder('utf-8').decode(fileContent);
        }
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error('Failed to parse .ork file: ' + parseError.textContent);
    }

    // Rocket name
    const rocketEl = doc.querySelector('rocket');
    if (!rocketEl) throw new Error('No <rocket> element found in .ork file');

    const rocketName = getText(rocketEl, 'name') || 'Imported Rocket';

    // Parse stages
    const stageEls = rocketEl.querySelectorAll(':scope > subcomponents > stage');
    const stages: Stage[] = [];

    for (const stageEl of Array.from(stageEls)) {
        const stage = createStage(getText(stageEl, 'name') || `Stage ${stages.length + 1}`);
        stage.components = parseSubcomponents(stageEl);
        stages.push(stage);
    }

    if (stages.length === 0) {
        warnings.push('No stages found, creating an empty sustainer stage');
        stages.push(createStage('Sustainer'));
    }

    const rocket: Rocket = {
        id: uuid(),
        name: rocketName,
        designer: '',
        comment: '',
        stages,
    };

    const motorInfo = extractMotorInfo(doc);
    const simulationOptions = extractSimulationOptions(doc);
    const flightReference = extractFlightData(doc);

    if (motorInfo) {
        warnings.push(`Motor: ${motorInfo.manufacturer} ${motorInfo.designation} (${(motorInfo.diameter * 1000).toFixed(0)}mm × ${(motorInfo.length * 1000).toFixed(0)}mm)`);
    }
    if (flightReference) {
        warnings.push(`Reference: Alt ${flightReference.maxAltitude.toFixed(0)}m, Mach ${flightReference.maxMach.toFixed(2)}, Apogee at ${flightReference.timeToApogee.toFixed(1)}s`);
    }

    return { rocket, motorInfo, simulationOptions, flightReference, warnings };
}

// ---- ZIP extraction (minimal for .ork) ----------------------------

async function extractXmlFromZip(buffer: ArrayBuffer): Promise<string> {
    // .ork ZIP files typically contain a single rocket.ork XML file
    // We use a minimal ZIP parser since we only need one file

    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Scan for local file headers (PK\x03\x04)
    for (let i = 0; i < bytes.length - 30; i++) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
            const fnameLen = view.getUint16(i + 26, true);
            const extraLen = view.getUint16(i + 28, true);
            const compressedSize = view.getUint32(i + 18, true);
            const compressionMethod = view.getUint16(i + 8, true);
            const fname = new TextDecoder().decode(bytes.slice(i + 30, i + 30 + fnameLen));

            if (fname.endsWith('.ork') || fname.endsWith('.xml') || fname === 'rocket.ork') {
                const dataStart = i + 30 + fnameLen + extraLen;
                const rawData = bytes.slice(dataStart, dataStart + compressedSize);

                if (compressionMethod === 0) {
                    // Stored (no compression)
                    return new TextDecoder('utf-8').decode(rawData);
                } else if (compressionMethod === 8) {
                    // Deflate — use DecompressionStream if available
                    if (typeof DecompressionStream !== 'undefined') {
                        const ds = new DecompressionStream('deflate-raw');
                        const writer = ds.writable.getWriter();
                        writer.write(rawData);
                        writer.close();
                        const reader = ds.readable.getReader();
                        const chunks: Uint8Array[] = [];
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            chunks.push(value);
                        }
                        const totalLength = chunks.reduce((a, c) => a + c.length, 0);
                        const result = new Uint8Array(totalLength);
                        let offset = 0;
                        for (const chunk of chunks) {
                            result.set(chunk, offset);
                            offset += chunk.length;
                        }
                        return new TextDecoder('utf-8').decode(result);
                    } else {
                        throw new Error('This .ork file is compressed. Please save it as uncompressed XML from OpenRocket.');
                    }
                }
            }
        }
    }
    throw new Error('Could not find XML content inside .ork ZIP file');
}

// ---- Motor matching -----------------------------------------------

/**
 * Try to match motor info from .ork to a motor in the available database.
 * Returns the matched motor or null.
 */
export function matchMotor(info: OrkMotorInfo, availableMotors: Motor[]): Motor | null {
    const designation = info.designation.trim();
    const manufacturer = info.manufacturer.trim().toLowerCase();

    // 1) Exact designation match
    let match = availableMotors.find(m =>
        m.designation.trim() === designation
    );
    if (match) return match;

    // 2) Case-insensitive designation match
    match = availableMotors.find(m =>
        m.designation.trim().toLowerCase() === designation.toLowerCase()
    );
    if (match) return match;

    // 3) Common name match + manufacturer
    match = availableMotors.find(m =>
        m.commonName.trim().toLowerCase() === designation.toLowerCase() &&
        m.manufacturer.toLowerCase().includes(manufacturer)
    );
    if (match) return match;

    // 4) Designation contains or is contained
    match = availableMotors.find(m =>
        m.designation.toLowerCase().includes(designation.toLowerCase()) ||
        designation.toLowerCase().includes(m.designation.toLowerCase())
    );
    if (match) return match;

    return null;
}
