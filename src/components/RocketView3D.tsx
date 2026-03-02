import React, { useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { getComponentPositions, getMaxRadius, getRocketLength } from '../physics/aerodynamics';
import { NoseCone, BodyTube, Transition, TrapezoidFinSet, EllipticalFinSet, FreeformFinSet } from '../types/rocket';

export const RocketView3D: React.FC = () => {
    const { rocket } = useStore();

    return (
        <div className="rocket-view-3d">
            <Canvas shadows style={{ background: '#1a1d23' }}>
                <PerspectiveCamera makeDefault position={[0.3, 0.2, 0.25]} fov={45} />
                <OrbitControls enableDamping dampingFactor={0.1} />
                <ambientLight intensity={0.55} />
                <directionalLight position={[5, 5, 5]} intensity={1.0} castShadow />
                <directionalLight position={[-3, 3, -3]} intensity={0.35} />
                <pointLight position={[0.15, 0.1, 0.2]} intensity={0.3} />
                <RocketModel rocket={rocket} />
                <Grid
                    infiniteGrid
                    cellSize={0.01}
                    sectionSize={0.1}
                    fadeDistance={2}
                    position={[0, -0.06, 0]}
                    cellColor="#2d323a"
                    sectionColor="#3a3f48"
                />
            </Canvas>
        </div>
    );
};

/* Build along +X axis directly — no confusing group rotation */
const RocketModel: React.FC<{ rocket: any }> = ({ rocket }) => {
    const groupRef = useRef<THREE.Group>(null);
    const positions = useMemo(() => getComponentPositions(rocket), [rocket]);
    const totalLength = useMemo(() => getRocketLength(rocket), [rocket]);

    const offset = totalLength / 2;

    return (
        <group ref={groupRef} position={[-offset, 0, 0]}>
            {positions.map(pos => {
                const comp = pos.component;
                const xStart = pos.xStart;

                if (comp.type === 'nosecone') {
                    return <NoseCone3D key={comp.id} comp={comp} xStart={xStart} />;
                }
                if (comp.type === 'bodytube') {
                    return <BodyTube3D key={comp.id} comp={comp} xStart={xStart} />;
                }
                if (comp.type === 'transition') {
                    return <Transition3D key={comp.id} comp={comp} xStart={xStart} />;
                }
                return null;
            })}
        </group>
    );
};

/* LatheGeometry axis is Y. Rotate -π/2 around Z so Y → +X */
const NoseCone3D: React.FC<{ comp: NoseCone; xStart: number }> = ({ comp, xStart }) => {
    const geometry = useMemo(() => {
        const segments = 48;
        const points: THREE.Vector2[] = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = t * comp.length;
            let r: number;

            switch (comp.shape) {
                case 'conical':
                    r = comp.baseRadius * t;
                    break;
                case 'ogive': {
                    const rho = (comp.baseRadius ** 2 + comp.length ** 2) / (2 * comp.baseRadius);
                    r = Math.sqrt(rho ** 2 - (comp.length - y) ** 2) - (rho - comp.baseRadius);
                    r = Math.max(0, r);
                    break;
                }
                case 'ellipsoid':
                    r = comp.baseRadius * Math.sqrt(1 - (1 - t) ** 2);
                    break;
                case 'power':
                    r = comp.baseRadius * Math.pow(t, comp.shapeParameter || 0.5);
                    break;
                case 'parabolic':
                    r = comp.baseRadius * (2 * t - t * t);
                    break;
                case 'haack': {
                    const theta = Math.acos(1 - 2 * t);
                    r = comp.baseRadius * Math.sqrt((theta - Math.sin(2 * theta) / 2) / Math.PI);
                    break;
                }
                default:
                    r = comp.baseRadius * t;
            }

            points.push(new THREE.Vector2(r, y));
        }

        return new THREE.LatheGeometry(points, 36);
    }, [comp]);

    const color = comp.color || '#d44';

    return (
        <mesh geometry={geometry} position={[xStart, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} side={THREE.DoubleSide} />
        </mesh>
    );
};

/* CylinderGeometry along Y, rotate -π/2 Z → along X */
const BodyTube3D: React.FC<{ comp: BodyTube; xStart: number }> = ({ comp, xStart }) => {
    const color = comp.color || '#a8b8c8';

    return (
        <group position={[xStart, 0, 0]}>
            <mesh position={[comp.length / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                <cylinderGeometry args={[comp.outerRadius, comp.outerRadius, comp.length, 36]} />
                <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} transparent opacity={0.85} side={THREE.DoubleSide} />
            </mesh>

            {comp.children?.map(child => {
                const childPosX = ('position' in child && typeof (child as any).position === 'number')
                    ? (child as any).position : 0;

                if (child.type === 'trapezoidfinset') {
                    return <TrapFin3D key={child.id} comp={child} bodyLength={comp.length} bodyRadius={comp.outerRadius} posX={childPosX} />;
                }
                if (child.type === 'ellipticalfinset') {
                    return <EllipFin3D key={child.id} comp={child} bodyLength={comp.length} bodyRadius={comp.outerRadius} posX={childPosX} />;
                }
                if (child.type === 'freeformfinset') {
                    return <FreeformFin3D key={child.id} comp={child} bodyLength={comp.length} bodyRadius={comp.outerRadius} posX={childPosX} />;
                }
                if (child.type === 'innertube') {
                    return (
                        <mesh key={child.id} position={[childPosX + child.length / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                            <cylinderGeometry args={[child.outerRadius, child.outerRadius, child.length, 16]} />
                            <meshStandardMaterial color="#5c6370" roughness={0.6} transparent opacity={0.3} side={THREE.DoubleSide} />
                        </mesh>
                    );
                }
                if (child.type === 'launchlug') {
                    return (
                        <mesh key={child.id}
                            position={[childPosX + child.length / 2, comp.outerRadius + child.outerRadius, 0]}
                            rotation={[0, 0, -Math.PI / 2]}
                        >
                            <cylinderGeometry args={[child.outerRadius, child.outerRadius, child.length, 12]} />
                            <meshStandardMaterial color="#6c7380" roughness={0.5} />
                        </mesh>
                    );
                }
                if (child.type === 'engineblock') {
                    return (
                        <mesh key={child.id} position={[childPosX + child.length / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                            <cylinderGeometry args={[child.outerRadius, child.outerRadius, child.length, 16]} />
                            <meshStandardMaterial color="#e67e22" roughness={0.5} transparent opacity={0.5} />
                        </mesh>
                    );
                }
                if (child.type === 'centeringring') {
                    return (
                        <mesh key={child.id} position={[childPosX + child.length / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                            <cylinderGeometry args={[child.outerRadius, child.outerRadius, child.length, 24]} />
                            <meshStandardMaterial color="#3498db" roughness={0.4} transparent opacity={0.35} />
                        </mesh>
                    );
                }
                if (child.type === 'bulkhead') {
                    return (
                        <mesh key={child.id} position={[childPosX + child.length / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                            <cylinderGeometry args={[child.outerRadius, child.outerRadius, child.length, 24]} />
                            <meshStandardMaterial color="#95a5a6" roughness={0.4} transparent opacity={0.4} />
                        </mesh>
                    );
                }
                if (child.type === 'tubecoupler') {
                    return (
                        <mesh key={child.id} position={[childPosX + child.length / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                            <cylinderGeometry args={[child.outerRadius, child.outerRadius, child.length, 16]} />
                            <meshStandardMaterial color="#8e44ad" roughness={0.5} transparent opacity={0.3} />
                        </mesh>
                    );
                }
                return null;
            })}
        </group>
    );
};

/* Fin shape is in X-Y plane (X = chord, Y = span), extruded along Z = thickness.
   Rotate around X to distribute fins around the body. */
const TrapFin3D: React.FC<{ comp: TrapezoidFinSet; bodyLength: number; bodyRadius: number; posX?: number }> = ({ comp, bodyLength, bodyRadius, posX }) => {
    const geometry = useMemo(() => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(comp.sweepLength, comp.height);
        shape.lineTo(comp.sweepLength + comp.tipChord, comp.height);
        shape.lineTo(comp.rootChord, 0);
        shape.closePath();

        return new THREE.ExtrudeGeometry(shape, { depth: comp.thickness, bevelEnabled: false });
    }, [comp]);

    const finX = posX !== undefined ? posX : bodyLength - comp.rootChord;

    return (
        <group position={[finX, 0, 0]}>
            {Array.from({ length: comp.finCount }).map((_, i) => {
                const angle = (i * 2 * Math.PI) / comp.finCount;
                return (
                    <group key={i} rotation={[angle, 0, 0]}>
                        <mesh geometry={geometry} position={[0, bodyRadius, -comp.thickness / 2]}>
                            <meshStandardMaterial color={comp.color || '#c8843c'} roughness={0.35} metalness={0.1} side={THREE.DoubleSide} />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
};

const EllipFin3D: React.FC<{ comp: EllipticalFinSet; bodyLength: number; bodyRadius: number; posX?: number }> = ({ comp, bodyLength, bodyRadius, posX }) => {
    const geometry = useMemo(() => {
        const shape = new THREE.Shape();
        const segments = 32;

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = t * comp.rootChord;
            const y = comp.height * Math.sqrt(1 - (2 * t - 1) ** 2);
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        }
        shape.lineTo(0, 0);
        shape.closePath();

        return new THREE.ExtrudeGeometry(shape, { depth: comp.thickness, bevelEnabled: false });
    }, [comp]);

    const finX = posX !== undefined ? posX : bodyLength - comp.rootChord;

    return (
        <group position={[finX, 0, 0]}>
            {Array.from({ length: comp.finCount }).map((_, i) => {
                const angle = (i * 2 * Math.PI) / comp.finCount;
                return (
                    <group key={i} rotation={[angle, 0, 0]}>
                        <mesh geometry={geometry} position={[0, bodyRadius, -comp.thickness / 2]}>
                            <meshStandardMaterial color={comp.color || '#c8843c'} roughness={0.35} metalness={0.1} side={THREE.DoubleSide} />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
};

const FreeformFin3D: React.FC<{ comp: FreeformFinSet; bodyLength: number; bodyRadius: number; posX?: number }> = ({ comp, bodyLength, bodyRadius, posX }) => {
    const geometry = useMemo(() => {
        if (comp.points.length < 3) return null;
        const shape = new THREE.Shape();
        shape.moveTo(comp.points[0][0], comp.points[0][1]);
        for (let i = 1; i < comp.points.length; i++) {
            shape.lineTo(comp.points[i][0], comp.points[i][1]);
        }
        shape.closePath();
        return new THREE.ExtrudeGeometry(shape, { depth: comp.thickness, bevelEnabled: false });
    }, [comp]);

    if (!geometry) return null;
    const finX = posX !== undefined ? posX : bodyLength * 0.6;

    return (
        <group position={[finX, 0, 0]}>
            {Array.from({ length: comp.finCount }).map((_, i) => {
                const angle = (i * 2 * Math.PI) / comp.finCount;
                return (
                    <group key={i} rotation={[angle, 0, 0]}>
                        <mesh geometry={geometry} position={[0, bodyRadius, -comp.thickness / 2]}>
                            <meshStandardMaterial color={comp.color || '#c8843c'} roughness={0.35} metalness={0.1} side={THREE.DoubleSide} />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
};

const Transition3D: React.FC<{ comp: Transition; xStart: number }> = ({ comp, xStart }) => {
    const geometry = useMemo(() => {
        const points: THREE.Vector2[] = [
            new THREE.Vector2(comp.foreRadius, 0),
            new THREE.Vector2(comp.aftRadius, comp.length),
        ];
        return new THREE.LatheGeometry(points, 36);
    }, [comp]);

    return (
        <mesh geometry={geometry} position={[xStart, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <meshStandardMaterial color={comp.color || '#a8b8c8'} roughness={0.4} metalness={0.15} side={THREE.DoubleSide} />
        </mesh>
    );
};
