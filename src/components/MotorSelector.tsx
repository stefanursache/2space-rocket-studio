import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { Motor } from '../types/rocket';

const impulseClasses = [
    '1/8A', '1/4A', '1/2A', 'A', 'B', 'C', 'D', 'E', 'F', 'G',
    'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
];
const certificationLevels = ['No certification', 'Level 1', 'Level 2', 'Level 3'];

function baseImpulseClass(value: string): string {
    const normalized = value.trim().toUpperCase();
    return normalized.match(/^(?:1\/8A|1\/4A|1\/2A|[A-O])$/)?.[0] || normalized;
}

function certificationFor(motor: Motor): string {
    const rank = 'ABCDEFGHIJKLMNO'.indexOf(baseImpulseClass(motor.impulseClass));
    // L and larger motors are the high-power motors requiring Level 3
    // certification in this application.
    if (rank >= 11) return 'Level 3';
    if (rank >= 8) return 'Level 2';
    if (rank >= 7) return 'Level 1';
    return 'No certification';
}

function stockFor(motor: Motor): number {
    return motor.availability === 'OOP' ? 0 : motor.availability === 'regular' ? 1 : motor.availability === 'occasional' ? 1 : 1;
}

function Sparkline({ motor }: { motor: Motor }) {
    const max = Math.max(...motor.thrustCurve.map(point => point[1]), 1);
    const points = motor.thrustCurve.map(([time, thrust]) =>
        `${(time / Math.max(motor.burnTime, 0.01)) * 100},${30 - (thrust / max) * 26}`
    ).join(' ');
    return (
        <svg className="motor-finder-sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" aria-label="Thrust curve">
            <polygon points={`0,30 ${points} 100,30`} />
            <polyline points={points} />
        </svg>
    );
}

export const MotorSelector: React.FC = () => {
    const {
        selectedMotor, setSelectedMotor, setShowMotorSelector, motors,
        motorSyncStatus, motorSyncProgress, lastMotorSync, motorSyncError,
        syncMotorsFromAPI, ensureThrustCurve,
    } = useStore();
    const [search, setSearch] = useState('');
    const [filterClass, setFilterClass] = useState<string>('all');
    const [filterCertification, setFilterCertification] = useState<string>('all');
    const [filterDiameter, setFilterDiameter] = useState<number>(0);
    const [filterManufacturer, setFilterManufacturer] = useState<string>('all');
    const [stockOnly, setStockOnly] = useState(false);
    const [sortBy, setSortBy] = useState<'impulse' | 'thrust' | 'burn'>('impulse');
    const [selectedPreview, setSelectedPreview] = useState<Motor | null>(selectedMotor);
    const [compare, setCompare] = useState<Set<string>>(new Set());
    const [planCount, setPlanCount] = useState(0);
    const [selectionError, setSelectionError] = useState<string | null>(null);

    const manufacturers = useMemo(() => Array.from(new Set(motors.map(m => m.manufacturer))).sort(), [motors]);
    const diameters = useMemo(() => Array.from(new Set(motors.map(m => m.diameter))).sort((a, b) => a - b), [motors]);
    const filteredMotors = useMemo(() => motors.filter(m => {
        const query = search.toLowerCase();
        return (!query || `${m.designation} ${m.manufacturer} ${m.commonName}`.toLowerCase().includes(query))
            && (filterClass === 'all' || baseImpulseClass(m.impulseClass) === filterClass)
            && (filterCertification === 'all' || certificationFor(m) === filterCertification)
            && (!filterDiameter || m.diameter === filterDiameter)
            && (filterManufacturer === 'all' || m.manufacturer === filterManufacturer)
            && (!stockOnly || stockFor(m) > 0);
    }).sort((a, b) => sortBy === 'thrust'
        ? b.averageThrust - a.averageThrust
        : sortBy === 'burn'
            ? b.burnTime - a.burnTime
            : baseImpulseClass(a.impulseClass).localeCompare(baseImpulseClass(b.impulseClass)) || a.totalImpulse - b.totalImpulse), [motors, search, filterClass, filterCertification, filterDiameter, filterManufacturer, stockOnly, sortBy]);

    const selectMotor = async () => {
        if (!selectedPreview) return;
        setSelectionError(null);
        const motor = await ensureThrustCurve(selectedPreview);
        if (motor.thrustCurve.length === 0) {
            setSelectionError(`No thrust curve is available for ${motor.designation}. Sync the live catalog and try again.`);
            return;
        }
        setSelectedMotor(motor);
        setShowMotorSelector(false);
    };

    const toggleCompare = (id: string) => {
        setCompare(current => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else if (next.size < 3) next.add(id);
            return next;
        });
    };

    return (
        <div className="modal-overlay motor-finder-overlay" onClick={() => setShowMotorSelector(false)}>
            <section className="motor-finder" onClick={event => event.stopPropagation()}>
                <header className="motor-finder-header">
                    <div>
                        <h1>HPR <span>MOTOR FINDER</span></h1>
                        <p>Live stock and prices for Aerotech, Cesaroni and Loki across a dozen U.S. dealers.</p>
                    </div>
                    <button className="modal-close" onClick={() => setShowMotorSelector(false)}>×</button>
                </header>

                <div className="motor-finder-toolbar">
                    <input
                        aria-label="Search motors"
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Search a motor: J350, 54mm K, Blue Thunder, RMS-38/720..."
                    />
                    <label className="stock-toggle"><input type="checkbox" checked={stockOnly} onChange={event => setStockOnly(event.target.checked)} /> <b>In stock only</b></label>
                    <select aria-label="Sort motors" value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)}>
                        <option value="impulse">Sort: impulse class</option>
                        <option value="thrust">Sort: average thrust</option>
                        <option value="burn">Sort: burn time</option>
                    </select>
                    <button className="finder-button" onClick={() => setPlanCount(count => count + 1)}>My rockets</button>
                    <button className="finder-button order-button">★ Plan order <b>{planCount}</b></button>
                </div>

                <div className="motor-finder-summary">
                    <strong>{filteredMotors.length} motors</strong> · {filteredMotors.filter(m => stockFor(m) > 0).length} in stock
                    {stockOnly && <span className="active-filter">available ×</span>}
                    {filterClass !== 'all' && <span className="active-filter">{filterClass} ×</span>}
                    <span className="sync-status">
                        {motorSyncStatus === 'syncing' ? motorSyncProgress : lastMotorSync ? `Stock updated ${new Date(lastMotorSync).toLocaleDateString()}` : 'Built-in catalog'}
                    </span>
                </div>

                <div className="motor-finder-content">
                    <aside className="motor-finder-filters">
                        <div className="finder-filter-title">Filters <button onClick={() => {
                            setFilterClass('all'); setFilterCertification('all'); setFilterDiameter(0); setFilterManufacturer('all'); setStockOnly(false);
                        }}>Reset</button></div>
                        <FilterGroup title="CERTIFICATION LEVEL">
                            {certificationLevels.map(level => (
                                <button key={level} className={filterCertification === level ? 'selected' : ''} onClick={() => setFilterCertification(filterCertification === level ? 'all' : level)}>
                                    {level}<small> · {motors.filter(m => certificationFor(m) === level).length}</small>
                                </button>
                            ))}
                        </FilterGroup>
                        <FilterGroup title="IMPULSE CLASS">
                            <div className="class-grid">{impulseClasses.map(value => <button key={value} className={filterClass === value ? 'selected' : ''} onClick={() => setFilterClass(filterClass === value ? 'all' : value)}>{value}</button>)}</div>
                        </FilterGroup>
                        <FilterGroup title="DIAMETER (MM)">
                            <div className="class-grid diameter-grid">{diameters.map(value => <button key={value} className={filterDiameter === value ? 'selected' : ''} onClick={() => setFilterDiameter(filterDiameter === value ? 0 : value)}>{value}</button>)}</div>
                        </FilterGroup>
                        <FilterGroup title="MANUFACTURER">
                            {manufacturers.map(value => <label className="checkbox-filter" key={value}><input type="checkbox" checked={filterManufacturer === value} onChange={() => setFilterManufacturer(filterManufacturer === value ? 'all' : value)} /> {value}<small>{motors.filter(m => m.manufacturer === value).length}</small></label>)}
                        </FilterGroup>
                        {motorSyncStatus !== 'syncing' && <button className="sync-catalog" onClick={() => syncMotorsFromAPI()}>↻ Sync live catalog</button>}
                        {motorSyncError && <p className="sync-error">{motorSyncError}</p>}
                    </aside>

                    <main className="motor-finder-results">
                        {filteredMotors.map(motor => {
                            const stock = stockFor(motor);
                            const isSelected = selectedPreview?.id === motor.id;
                            return (
                                <article key={motor.id} className={`motor-result-card ${isSelected ? 'selected' : ''}`} onClick={() => setSelectedPreview(motor)}>
                                    <div className="motor-card-name"><b className="motor-icon">M</b><div><strong>{motor.designation}</strong><span>{motor.manufacturer} · {motor.diameter} mm · {motor.commonName}</span><em>{certificationFor(motor) === 'Level 3' ? 'L3' : certificationFor(motor).replace('Level ', 'L')}</em></div></div>
                                    <Metric label="Impulse" value={`${motor.totalImpulse.toLocaleString()} N·s`} />
                                    <Metric label="Avg thrust" value={`${motor.averageThrust.toLocaleString()} N`} />
                                    <Metric label="Burn" value={`${motor.burnTime.toFixed(2)} s`} />
                                    <Metric label="Propellant" value={motor.commonName} />
                                    <Sparkline motor={motor} />
                                    <div className="motor-card-stock"><span className={stock ? 'in-stock' : 'out-stock'}>● {stock ? 'Available in live catalog' : 'Marked out of production'}</span><strong>{motor.totalImpulse.toLocaleString()} N·s</strong><small>{motor.infoUrl ? 'Open manufacturer data' : 'ThrustCurve.org data'}</small></div>
                                    <button className={`compare-button ${compare.has(motor.id) ? 'active' : ''}`} onClick={event => { event.stopPropagation(); toggleCompare(motor.id); }}>☆ Compare</button>
                                </article>
                            );
                        })}
                        {filteredMotors.length === 0 && <div className="empty-finder">No motors match these filters.</div>}
                    </main>
                </div>
                <footer className="motor-finder-footer">
                    <span>{compare.size ? `${compare.size} motor${compare.size > 1 ? 's' : ''} selected for comparison` : 'Select a motor to preview its thrust curve'}</span>
                    {selectionError && <span className="sync-error">{selectionError}</span>}
                    <button className="btn-cancel" onClick={() => setShowMotorSelector(false)}>Cancel</button>
                    <button className="finder-primary" disabled={!selectedPreview} onClick={selectMotor}>Use selected motor</button>
                </footer>
            </section>
        </div>
    );
};

const FilterGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="finder-filter-group"><h3>{title}</h3>{children}</div>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="motor-card-metric"><span>{label}</span><strong>{value}</strong></div>
);
