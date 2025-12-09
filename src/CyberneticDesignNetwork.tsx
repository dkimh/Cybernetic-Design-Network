import React, { useMemo, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import data from '../public/data.json';

// Keep types compatible with your existing graph
interface RawNode {
    id: string;
    label: string;
}

interface RawLink {
    source: string;
    target: string;
}

type Path = string[];

// ==== Utility: BFS path from a node through directed links ====
function bfsPath(startId: string, links: RawLink[]): Path {
    const visited = new Set<string>();
    const queue: string[] = [startId];
    const path: string[] = [];
    
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        path.push(current);
        
        const outgoing = links
            .filter(l => l.source === current)
            .map(l => l.target);
        
        for (const n of outgoing) {
            if (!visited.has(n)) queue.push(n);
        }
    }
    
    return path;
}

// ==== Helper: topographic “mountain” rings ====
const ContourRings: React.FC = () => {
    const levels = useMemo(() => {
        const rings: { radius: number; height: number }[] = [];
        const baseRadius = 4.5;
        const topHeight = 2.7;
        const steps = 14;
        
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1); // 0–1
            rings.push({
                radius: baseRadius * (1 - t * 0.7), // smaller near top
                height: t * topHeight,
            });
        }
        return rings;
    }, []);
    
    return (
        <>
            {levels.map((level, i) => {
                const segments = 128;
                const pts: THREE.Vector3[] = [];
                for (let s = 0; s <= segments; s++) {
                    const a = (s / segments) * Math.PI * 2;
                    const x = Math.cos(a) * level.radius;
                    const z = Math.sin(a) * level.radius;
                    const y = level.height;
                    pts.push(new THREE.Vector3(x, y, z));
                }
                
                return (
                    <Line
                        key={i}
                        points={pts}
                        color={i === levels.length - 1 ? '#ffffff' : '#3b3b3b'}
                        lineWidth={i === levels.length - 1 ? 2 : 1}
                    />
                );
            })}
        </>
    );
};

// ==== Helper: base dark disk under the mountain ====
const BaseDisk: React.FC = () => {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[5.5, 128]} />
            <meshStandardMaterial
                color="#05060a"
                metalness={0.6}
                roughness={0.9}
            />
        </mesh>
    );
};

// ==== Node marker in 3D space ====
interface NodeMarkerProps {
    id: string;
    label: string;
    position: THREE.Vector3;
    color: string;
    onClick: (id: string) => void;
    isActive: boolean;
}

const NodeMarker: React.FC<NodeMarkerProps> = ({
                                                   id,
                                                   label,
                                                   position,
                                                   color,
                                                   onClick,
                                                   isActive,
                                               }) => {
    return (
        <group
            position={position}
            onClick={e => {
                e.stopPropagation();
                onClick(id);
            }}
        >
            {/* Outer glow halo */}
            <mesh>
                <sphereGeometry args={[0.35, 32, 32]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={isActive ? 0.3 : 0.15}
                    depthWrite={false}
                />
            </mesh>
            
            {/* Middle glow ring */}
            <mesh>
                <sphereGeometry args={[0.22, 32, 32]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={isActive ? 0.5 : 0.3}
                    depthWrite={false}
                />
            </mesh>
            
            {/* Core sphere */}
            <mesh castShadow>
                <sphereGeometry args={[0.14, 32, 32]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={isActive ? 1.5 : 0.8}
                    roughness={0.2}
                    metalness={0.8}
                />
            </mesh>
            
            {/* Point light for bloom effect */}
            <pointLight
                color={color}
                intensity={isActive ? 1.5 : 0.8}
                distance={2}
                decay={2}
            />
            
            {/* Label */}
            <Html position={[0, 0.6, 0]} distanceFactor={8}>
                <div
                    style={{
                        padding: '3px 7px',
                        borderRadius: '999px',
                        fontSize: 10,
                        background: isActive
                            ? 'rgba(0,212,255,0.25)'
                            : 'rgba(10,10,15,0.8)',
                        border: isActive
                            ? '1px solid rgba(0,212,255,0.6)'
                            : '1px solid rgba(255,255,255,0.1)',
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                        boxShadow: isActive
                            ? '0 0 12px rgba(0,212,255,0.9)'
                            : '0 0 4px rgba(0,0,0,0.6)',
                    }}
                >
                    {label}
                </div>
            </Html>
        </group>
    );
};

// ==== Main 3D Scene ====
const CyberneticTopoScene: React.FC = () => {
    const nodes = data.nodes as RawNode[];
    const links = data.links as RawLink[];
    
    const [activePath, setActivePath] = useState<Path>([]);
    const [activeNode, setActiveNode] = useState<string | null>(null);
    
    // Color scheme compatible with your 2D graph
    const getNodeColor = useCallback((id: string): string => {
        const main: Record<string, string> = {
            form: '#4ECDC4',
            function: '#95E1D3',
            material: '#FF6B6B',
            emotion: '#F38181',
            process: '#AA96DA',
            feedbackLoop: '#FCBAD3',
        };
        return main[id] || '#a0a0a0';
    }, []);
    
    // Place each node on the “mountain” using polar coordinates
    const nodePositions = useMemo(() => {
        const map = new Map<string, THREE.Vector3>();
        const n = nodes.length;
        const radiusInner = 1.6;
        const radiusOuter = 4.0;
        const topHeight = 2.7;
        
        nodes.forEach((node, i) => {
            const t = i / n;
            const angle = t * Math.PI * 2;
            const ringIndex = i % 4;
            const ringT = ringIndex / 3; // 0–1
            const radius =
                radiusInner + (radiusOuter - radiusInner) * ringT * 0.9;
            
            // Higher rings are closer to the summit
            const height =
                0.5 + (1 - ringT) * (topHeight - 0.5) + Math.sin(t * 4 * Math.PI) * 0.08;
            
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = height;
            
            map.set(node.id, new THREE.Vector3(x, y, z));
        });
        
        return map;
    }, [nodes]);
    
    // Build 3D path points for currently active path
    const pathPoints = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        activePath.forEach((id, idx) => {
            const base = nodePositions.get(id);
            if (!base) return;
            // Slightly lift the path above the terrain
            const lifted = base.clone().add(new THREE.Vector3(0, 0.12, 0));
            // Slight smoothing between points
            if (idx > 0 && pts.length > 0) {
                const prev = pts[pts.length - 1];
                const mid = prev.clone().lerp(lifted, 0.5).add(new THREE.Vector3(0, 0.05, 0));
                pts.push(mid);
            }
            pts.push(lifted);
        });
        return pts;
    }, [activePath, nodePositions]);
    
    const handleNodeClick = (id: string) => {
        setActiveNode(id);
        setActivePath(bfsPath(id, links));
    };
    
    return (
        <>
            {/* Lighting */}
            <ambientLight intensity={0.25} />
            <directionalLight
                position={[4, 7, 3]}
                intensity={0.8}
                castShadow
            />
            <directionalLight
                position={[-4, 3, -2]}
                intensity={0.4}
                color="#6699cc"
            />
            
            {/* Base and contour mountain */}
            <group rotation={[-0.45, 0, 0]}>
                <BaseDisk />
                <ContourRings />
                
                {/* Nodes */}
                {nodes.map(node => {
                    const pos = nodePositions.get(node.id);
                    if (!pos) return null;
                    return (
                        <NodeMarker
                            key={node.id}
                            id={node.id}
                            label={node.label}
                            position={pos}
                            color={getNodeColor(node.id)}
                            onClick={handleNodeClick}
                            isActive={activeNode === node.id || activePath.includes(node.id)}
                        />
                    );
                })}
                
                {/* Active path */}
                {pathPoints.length > 1 && (
                    <Line
                        points={pathPoints}
                        color="#ffffff"
                        lineWidth={3}
                    />
                )}
            </group>
            
            <OrbitControls
                enablePan
                enableZoom
                enableRotate
                maxDistance={18}
                minDistance={5}
                target={[0, 1.5, 0]}
            />
        </>
    );
};

// ==== Wrapper with full-screen canvas + overlay UI ====
const CyberneticTopoMap: React.FC = () => {
    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                background: 'radial-gradient(circle at top, #151822 0, #050509 60%)',
                position: 'relative',
                color: '#ffffff',
                overflow: 'hidden',
            }}
        >
            {/* Small overlay description */}
            <div
                style={{
                    position: 'absolute',
                    top: 20,
                    left: 20,
                    padding: '14px 18px',
                    background: 'rgba(10,10,15,0.9)',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    maxWidth: 320,
                    fontSize: 12,
                    lineHeight: 1.6,
                    zIndex: 2,
                }}
            >
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                    Cybernetic Topographic Map
                </div>
                <div style={{ color: '#aaaaaa' }}>
                    Each node glows on the terrain like a luminous beacon. Click a node
                    to trace its dynamic path across the mountain. Drag to orbit, scroll
                    to zoom.
                </div>
            </div>
            
            <Canvas
                shadows
                camera={{ position: [0, 7, 10], fov: 45 }}
            >
                <CyberneticTopoScene />
            </Canvas>
        </div>
    );
};

export default CyberneticTopoMap;