import { Material, SurfaceFinish } from '../types/rocket';

// ===========================
// Material Database
// ===========================

export const BULK_MATERIALS: Material[] = [
    { name: 'Balsa', density: 130, type: 'bulk' },
    { name: 'Basswood', density: 500, type: 'bulk' },
    { name: 'Birch', density: 670, type: 'bulk' },
    { name: 'Cardboard', density: 680, type: 'bulk' },
    { name: 'Carbon fiber', density: 1600, type: 'bulk' },
    { name: 'Fiberglass (G10)', density: 1800, type: 'bulk' },
    { name: 'Kraft phenolic', density: 950, type: 'bulk' },
    { name: 'Paper (office)', density: 820, type: 'bulk' },
    { name: 'Pine', density: 530, type: 'bulk' },
    { name: 'Plywood (birch)', density: 630, type: 'bulk' },
    { name: 'Polycarbonate (Lexan)', density: 1200, type: 'bulk' },
    { name: 'Polystyrene (PS)', density: 1050, type: 'bulk' },
    { name: 'PVC', density: 1390, type: 'bulk' },
    { name: 'Spruce', density: 450, type: 'bulk' },
    { name: 'Aluminum 6061', density: 2700, type: 'bulk' },
    { name: 'Aluminum 7075', density: 2810, type: 'bulk' },
    { name: 'Brass', density: 8550, type: 'bulk' },
    { name: 'Steel (mild)', density: 7850, type: 'bulk' },
    { name: 'Titanium', density: 4510, type: 'bulk' },
    { name: 'Acrylic (cast)', density: 1190, type: 'bulk' },
    { name: 'Nylon (6/6)', density: 1140, type: 'bulk' },
    { name: 'ABS', density: 1050, type: 'bulk' },
    { name: 'PLA', density: 1250, type: 'bulk' },
    { name: 'PETG', density: 1270, type: 'bulk' },
    { name: 'Blue tube', density: 1300, type: 'bulk' },
    { name: 'Quantum tube', density: 1050, type: 'bulk' },
];

export const SURFACE_MATERIALS: Material[] = [
    { name: 'Ripstop nylon', density: 0.067, type: 'surface' },
    { name: 'Mylar', density: 0.021, type: 'surface' },
    { name: 'Polyethylene (thin)', density: 0.015, type: 'surface' },
    { name: 'Silk', density: 0.060, type: 'surface' },
    { name: 'Cotton (heavy)', density: 0.170, type: 'surface' },
    { name: 'Kevlar fabric', density: 0.170, type: 'surface' },
    { name: 'Plastic (garbage bag)', density: 0.018, type: 'surface' },
];

export const LINE_MATERIALS: Material[] = [
    { name: 'Braided nylon (2mm)', density: 0.004, type: 'line' },
    { name: 'Braided nylon (4mm)', density: 0.012, type: 'line' },
    { name: 'Elastic cord (6mm flat)', density: 0.004, type: 'line' },
    { name: 'Elastic cord (12mm flat)', density: 0.012, type: 'line' },
    { name: 'Kevlar cord (2mm)', density: 0.005, type: 'line' },
    { name: 'Kevlar cord (4mm)', density: 0.018, type: 'line' },
    { name: 'Nylon string (1mm)', density: 0.001, type: 'line' },
    { name: 'Steel wire (1mm)', density: 0.006, type: 'line' },
    { name: 'Tubular nylon (12mm)', density: 0.013, type: 'line' },
    { name: 'Tubular nylon (25mm)', density: 0.029, type: 'line' },
];

// Surface roughness values for different finishes (m)
export const SURFACE_ROUGHNESS: Record<SurfaceFinish, number> = {
    'unfinished': 500e-6,
    'rough': 200e-6,
    'unfinished_paint': 100e-6,
    'regular_paint': 60e-6,
    'smooth_paint': 20e-6,
    'polished': 2e-6,
};

export function getMaterialByName(name: string): Material | undefined {
    return [...BULK_MATERIALS, ...SURFACE_MATERIALS, ...LINE_MATERIALS].find(m => m.name === name);
}

export function getDefaultBulkMaterial(): Material {
    return BULK_MATERIALS.find(m => m.name === 'Cardboard')!;
}

export function getDefaultSurfaceMaterial(): Material {
    return SURFACE_MATERIALS.find(m => m.name === 'Ripstop nylon')!;
}

export function getDefaultLineMaterial(): Material {
    return LINE_MATERIALS.find(m => m.name === 'Braided nylon (2mm)')!;
}
