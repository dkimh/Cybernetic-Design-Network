import React, { useMemo, useState, useCallback, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import data from '../public/data.json';

interface RawNode {
    id: string;
    label: string;
}

interface RawLink {
    source: string;
    target: string;
}

interface NodeLayer {
    level: number;
    nodes: string[];
}

interface NodeExploration {
    visits: number;
    insightful: number;
    neutral: number;
    familiar: number;
}

// ==== Utility: Calculate exploration score for a node ====
function getExplorationScore(nodeId: string, explorationData: Map<string, NodeExploration>): number {
    const data = explorationData.get(nodeId);
    if (!data) return 0;
    
    const totalFeedback = data.insightful + data.neutral + data.familiar;
    if (totalFeedback === 0) {
        return 0; // Neutral score for unexplored nodes
    }
    
    // Score: insightful increases score, familiar decreases score
    // Range: -2 to +2
    const score = (data.insightful * 2 - data.familiar * 2) / totalFeedback;
    return score;
}

// ==== Adaptive BFS with layer reordering based on exploration ====
function getAdaptiveHierarchicalLayers(
    startId: string,
    links: RawLink[],
    explorationData: Map<string, NodeExploration>,
    cyberneticMode: boolean
): NodeLayer[] {
    const visited = new Set<string>();
    const layers: NodeLayer[] = [];
    let currentLevel = [startId];
    let level = 0;
    
    // First, do normal BFS to get all reachable nodes
    const allNodesInPath: string[] = [];
    const tempVisited = new Set<string>();
    let tempLevel = [startId];
    
    while (tempLevel.length > 0) {
        const validNodes = tempLevel.filter(id => !tempVisited.has(id));
        if (validNodes.length === 0) break;
        
        validNodes.forEach(id => {
            tempVisited.add(id);
            allNodesInPath.push(id);
        });
        
        const nextLevel: string[] = [];
        validNodes.forEach(nodeId => {
            const outgoing = links
                .filter(l => l.source === nodeId)
                .map(l => l.target);
            nextLevel.push(...outgoing);
        });
        
        tempLevel = nextLevel;
    }
    
    // In cybernetic mode, reorder nodes by exploration score
    if (cyberneticMode && allNodesInPath.length > 1) {
        // Keep the start node at layer 0
        const startNode = allNodesInPath[0];
        const otherNodes = allNodesInPath.slice(1);
        
        // Sort other nodes by exploration score (higher score = earlier layer)
        const nodesWithScores = otherNodes.map(nodeId => ({
            id: nodeId,
            score: getExplorationScore(nodeId, explorationData)
        }));
        
        nodesWithScores.sort((a, b) => b.score - a.score);
        
        // Distribute into layers
        layers.push({ level: 0, nodes: [startNode] });
        
        const nodesPerLayer = 3;
        let currentLayerNodes: string[] = [];
        let currentLayerIndex = 1;
        
        nodesWithScores.forEach((node, idx) => {
            currentLayerNodes.push(node.id);
            
            if (currentLayerNodes.length >= nodesPerLayer || idx === nodesWithScores.length - 1) {
                layers.push({ level: currentLayerIndex, nodes: [...currentLayerNodes] });
                currentLayerNodes = [];
                currentLayerIndex++;
            }
        });
        
        return layers;
    }
    
    // Normal mode: standard BFS
    while (currentLevel.length > 0) {
        const validNodes = currentLevel.filter(id => !visited.has(id));
        if (validNodes.length === 0) break;
        
        validNodes.forEach(id => visited.add(id));
        layers.push({ level, nodes: validNodes });
        
        const nextLevel: string[] = [];
        validNodes.forEach(nodeId => {
            const outgoing = links
                .filter(l => l.source === nodeId)
                .map(l => l.target);
            nextLevel.push(...outgoing);
        });
        
        currentLevel = nextLevel;
        level++;
    }
    
    return layers;
}

// ==== Force-directed layout with randomization ====
function forceDirectedLayout(nodes: RawNode[], links: RawLink[], randomize: boolean = false) {
    const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    
    // Initialize positions
    nodes.forEach((node, i) => {
        if (randomize) {
            // Random initialization with larger spread
            const angle = Math.random() * Math.PI * 2;
            const radius = 2 + Math.random() * 3;
            positions.set(node.id, {
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
                vx: (Math.random() - 0.5) * 0.1,
                vy: (Math.random() - 0.5) * 0.1
            });
        } else {
            const angle = (i / nodes.length) * Math.PI * 2;
            const radius = 3.5;
            positions.set(node.id, {
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
                vx: 0,
                vy: 0
            });
        }
    });
    
    // Force simulation
    const iterations = randomize ? 200 : 100;
    const repulsionStrength = 0.5;
    const attractionStrength = 0.02;
    const damping = 0.85;
    
    for (let iter = 0; iter < iterations; iter++) {
        // Apply repulsion between all nodes
        nodes.forEach((nodeA) => {
            nodes.forEach((nodeB) => {
                if (nodeA.id === nodeB.id) return;
                
                const posA = positions.get(nodeA.id)!;
                const posB = positions.get(nodeB.id)!;
                
                const dx = posA.x - posB.x;
                const dy = posA.y - posB.y;
                const distSq = dx * dx + dy * dy + 0.01;
                const dist = Math.sqrt(distSq);
                
                const force = repulsionStrength / distSq;
                
                posA.vx += (dx / dist) * force;
                posA.vy += (dy / dist) * force;
            });
        });
        
        // Apply attraction along links
        links.forEach(link => {
            const posA = positions.get(link.source);
            const posB = positions.get(link.target);
            if (!posA || !posB) return;
            
            const dx = posB.x - posA.x;
            const dy = posB.y - posA.y;
            const dist = Math.sqrt(dx * dx + dy * dy + 0.01);
            
            const force = dist * attractionStrength;
            
            posA.vx += (dx / dist) * force;
            posA.vy += (dy / dist) * force;
            posB.vx -= (dx / dist) * force;
            posB.vy -= (dy / dist) * force;
        });
        
        // Update positions with velocity damping
        nodes.forEach(node => {
            const pos = positions.get(node.id)!;
            pos.x += pos.vx;
            pos.y += pos.vy;
            pos.vx *= damping;
            pos.vy *= damping;
            
            // Add slight random jitter in early iterations for randomize mode
            if (randomize && iter < iterations / 3) {
                pos.x += (Math.random() - 0.5) * 0.05;
                pos.y += (Math.random() - 0.5) * 0.05;
            }
        });
    }
    
    // Normalize to fit within viewport
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    positions.forEach(pos => {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
    });
    
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const maxRange = Math.max(rangeX, rangeY) || 1;
    const targetSize = 8;
    const scale = targetSize / maxRange;
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    positions.forEach(pos => {
        pos.x = (pos.x - centerX) * scale;
        pos.y = (pos.y - centerY) * scale;
    });
    
    return positions;
}

// ==== Camera Controller for smooth transitions ====
interface CameraControllerProps {
    targetPosition: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    is2DMode: boolean;
}

const CameraController: React.FC<CameraControllerProps> = ({
                                                               targetPosition,
                                                               targetLookAt,
                                                               is2DMode
                                                           }) => {
    const { camera } = useThree();
    const controlsRef = useRef<any>(null);
    
    useFrame(() => {
        if (!controlsRef.current) return;
        
        camera.position.lerp(targetPosition, 0.05);
        
        const currentTarget = controlsRef.current.target;
        currentTarget.lerp(targetLookAt, 0.05);
        controlsRef.current.update();
    });
    
    return (
        <OrbitControls
            ref={controlsRef}
            enablePan={true}
            enableZoom={true}
            enableRotate={!is2DMode}
            maxDistance={35}
            minDistance={2}
        />
    );
};

// ==== Node marker ====
interface NodeMarkerProps {
    id: string;
    label: string;
    position: THREE.Vector3;
    color: string;
    onClick: (id: string) => void;
    isActive: boolean;
    is2DMode: boolean;
    exploration: NodeExploration;
    cyberneticMode: boolean;
    layerChanged?: boolean;
}

const NodeMarker: React.FC<NodeMarkerProps> = ({
                                                   id,
                                                   label,
                                                   position,
                                                   color,
                                                   onClick,
                                                   isActive,
                                                   is2DMode,
                                                   exploration,
                                                   cyberneticMode,
                                                   layerChanged
                                               }) => {
    // Calculate feedback-based adjustments
    const getFeedbackAdjustment = () => {
        if (!cyberneticMode) {
            return { opacity: 1, intensity: 1 };
        }
        
        const totalFeedback = exploration.insightful + exploration.neutral + exploration.familiar;
        
        if (totalFeedback === 0) {
            return { opacity: 1, intensity: 1 };
        }
        
        // Calculate weighted score
        const score = (exploration.insightful * 1 - exploration.familiar * 1) / totalFeedback;
        
        // Opacity: reduce for familiar nodes (0.3 to 1.0)
        const opacity = Math.max(0.3, 1 - (exploration.familiar / (totalFeedback + 1)) * 0.7);
        
        // Intensity: increase for insightful nodes (0.8 to 1.8)
        const intensity = 1 + (score * 0.5);
        
        return { opacity, intensity };
    };
    
    const { opacity: nodeOpacity, intensity: intensityMultiplier } = getFeedbackAdjustment();
    
    const baseIntensity = isActive ? 1.5 : 0.8;
    const emissiveIntensity = baseIntensity * intensityMultiplier;
    
    const baseOpacity = isActive ? 0.3 : 0.15;
    const adjustedOpacity = baseOpacity * nodeOpacity;
    
    return (
        <group
            position={position}
            onClick={e => {
                e.stopPropagation();
                onClick(id);
            }}
        >
            {/* Layer changed indicator */}
            {layerChanged && (
                <mesh position={[0, 0.8, 0]}>
                    <ringGeometry args={[0.15, 0.2, 16]} />
                    <meshBasicMaterial
                        color="#ffaa00"
                        transparent
                        opacity={0.8}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            )}
            
            {/* Outer glow halo */}
            <mesh>
                <sphereGeometry args={[0.35, 32, 32]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={adjustedOpacity}
                    depthWrite={false}
                />
            </mesh>
            
            {/* Middle glow ring */}
            <mesh>
                <sphereGeometry args={[0.22, 32, 32]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={(isActive ? 0.5 : 0.3) * nodeOpacity}
                    depthWrite={false}
                />
            </mesh>
            
            {/* Core sphere */}
            <mesh castShadow>
                <sphereGeometry args={[0.14, 32, 32]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={emissiveIntensity}
                    roughness={0.2}
                    metalness={0.8}
                    transparent={cyberneticMode}
                    opacity={nodeOpacity}
                />
            </mesh>
            
            {/* Point light for bloom effect */}
            <pointLight
                color={color}
                intensity={emissiveIntensity}
                distance={2}
                decay={2}
            />
            
            {/* Label */}
            <Html position={[0, 0.6, 0]} distanceFactor={is2DMode ? 12 : 8}>
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
                            : layerChanged
                                ? '1px solid #ffaa00'
                                : '1px solid rgba(255,255,255,0.1)',
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                        boxShadow: isActive
                            ? '0 0 12px rgba(0,212,255,0.9)'
                            : layerChanged
                                ? '0 0 8px #ffaa00'
                                : '0 0 4px rgba(0,0,0,0.6)',
                        opacity: nodeOpacity,
                    }}
                >
                    {label}
                    {layerChanged && <span style={{ marginLeft: 4 }}>↕️</span>}
                </div>
            </Html>
        </group>
    );
};

// ==== Main 3D Scene ====
interface SceneProps {
    activeNode: string | null;
    hierarchicalLayers: NodeLayer[];
    onNodeClick: (id: string) => void;
    cyberneticMode: boolean;
    layout2D: Map<string, { x: number; y: number; vx: number; vy: number }>;
    explorationData: Map<string, NodeExploration>;
    previousLayers: NodeLayer[];
}

const CyberneticTopoScene: React.FC<SceneProps> = ({
                                                       activeNode,
                                                       hierarchicalLayers,
                                                       onNodeClick,
                                                       cyberneticMode,
                                                       layout2D,
                                                       explorationData,
                                                       previousLayers
                                                   }) => {
    const nodes = data.nodes as RawNode[];
    const links = data.links as RawLink[];
    
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
    
    // Detect nodes that changed layers
    const changedLayerNodes = useMemo(() => {
        if (!cyberneticMode || previousLayers.length === 0) return new Map<string, { from: number; to: number }>();
        
        const previousLayerMap = new Map<string, number>();
        previousLayers.forEach(layer => {
            layer.nodes.forEach(nodeId => {
                previousLayerMap.set(nodeId, layer.level);
            });
        });
        
        const currentLayerMap = new Map<string, number>();
        hierarchicalLayers.forEach(layer => {
            layer.nodes.forEach(nodeId => {
                currentLayerMap.set(nodeId, layer.level);
            });
        });
        
        const changed = new Map<string, { from: number; to: number }>();
        currentLayerMap.forEach((currentLevel, nodeId) => {
            const previousLevel = previousLayerMap.get(nodeId);
            if (previousLevel !== undefined && previousLevel !== currentLevel) {
                changed.set(nodeId, { from: previousLevel, to: currentLevel });
            }
        });
        
        return changed;
    }, [hierarchicalLayers, previousLayers, cyberneticMode]);
    
    // 2D mode positions
    const twoDPositions = useMemo(() => {
        const map = new Map<string, THREE.Vector3>();
        layout2D.forEach((pos, id) => {
            map.set(id, new THREE.Vector3(pos.x, 0, pos.y));
        });
        return map;
    }, [layout2D]);
    
    // Hierarchical mode: layered vertical arrangement
    const hierarchicalPositions = useMemo(() => {
        const map = new Map<string, THREE.Vector3>();
        
        if (!activeNode || hierarchicalLayers.length === 0) {
            return map;
        }
        
        hierarchicalLayers.forEach((layer, levelIdx) => {
            const yPos = 4 - levelIdx * 1.8;
            const numNodes = layer.nodes.length;
            const radius = Math.min(3, numNodes * 0.4);
            
            layer.nodes.forEach((nodeId, nodeIdx) => {
                const angle = (nodeIdx / numNodes) * Math.PI * 2;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                
                map.set(nodeId, new THREE.Vector3(x, yPos, z));
            });
        });
        
        return map;
    }, [activeNode, hierarchicalLayers]);
    
    // Current positions
    const nodePositions = useMemo(() => {
        if (!activeNode) return twoDPositions;
        return hierarchicalPositions;
    }, [activeNode, twoDPositions, hierarchicalPositions]);
    
    // Camera settings
    const cameraSettings = useMemo(() => {
        if (!activeNode) {
            return {
                position: new THREE.Vector3(0, 16, 0.1),
                lookAt: new THREE.Vector3(0, 0, 0),
                is2DMode: true
            };
        } else {
            return {
                position: new THREE.Vector3(8, 6, 8),
                lookAt: new THREE.Vector3(0, 2, 0),
                is2DMode: false
            };
        }
    }, [activeNode]);
    
    // Connection lines for hierarchical mode
    const hierarchicalLines = useMemo(() => {
        if (!activeNode || hierarchicalLayers.length === 0) return [];
        
        const lines: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
        
        hierarchicalLayers.forEach((layer, levelIdx) => {
            if (levelIdx === hierarchicalLayers.length - 1) return;
            
            const nextLayer = hierarchicalLayers[levelIdx + 1];
            
            layer.nodes.forEach(sourceId => {
                const sourcePos = hierarchicalPositions.get(sourceId);
                if (!sourcePos) return;
                
                nextLayer.nodes.forEach(targetId => {
                    const isConnected = links.some(
                        l => l.source === sourceId && l.target === targetId
                    );
                    
                    if (isConnected) {
                        const targetPos = hierarchicalPositions.get(targetId);
                        if (targetPos) {
                            lines.push({ from: sourcePos.clone(), to: targetPos.clone() });
                        }
                    }
                });
            });
        });
        
        return lines;
    }, [activeNode, hierarchicalLayers, hierarchicalPositions, links]);
    
    // Connection lines for 2D mode
    const twoDLines = useMemo(() => {
        if (activeNode) return [];
        
        return links.map(link => {
            const from = twoDPositions.get(link.source);
            const to = twoDPositions.get(link.target);
            if (!from || !to) return null;
            return { from, to };
        }).filter(Boolean) as { from: THREE.Vector3; to: THREE.Vector3 }[];
    }, [activeNode, links, twoDPositions]);
    
    const isNodeInPath = useCallback((nodeId: string) => {
        return hierarchicalLayers.some(layer => layer.nodes.includes(nodeId));
    }, [hierarchicalLayers]);
    
    return (
        <>
            {/* Lighting */}
            <ambientLight intensity={0.3} />
            <directionalLight position={[4, 7, 3]} intensity={0.8} castShadow />
            <directionalLight position={[-4, 3, -2]} intensity={0.4} color="#6699cc" />
            
            {/* 2D connection lines */}
            {twoDLines.map((line, idx) => (
                <Line
                    key={`2d-${idx}`}
                    points={[line.from, line.to]}
                    color="#333344"
                    lineWidth={1}
                    transparent
                    opacity={0.4}
                />
            ))}
            
            {/* Hierarchical connection lines */}
            {hierarchicalLines.map((line, idx) => (
                <Line
                    key={`3d-${idx}`}
                    points={[line.from, line.to]}
                    color="#4444aa"
                    lineWidth={1.5}
                    transparent
                    opacity={0.6}
                />
            ))}
            
            {/* Nodes */}
            {nodes.map(node => {
                const pos = nodePositions.get(node.id);
                if (!pos) return null;
                
                const exploration = explorationData.get(node.id) || {
                    visits: 0,
                    insightful: 0,
                    neutral: 0,
                    familiar: 0
                };
                
                const layerChange = changedLayerNodes.get(node.id);
                
                return (
                    <NodeMarker
                        key={node.id}
                        id={node.id}
                        label={node.label}
                        position={pos}
                        color={getNodeColor(node.id)}
                        onClick={onNodeClick}
                        isActive={activeNode === node.id || isNodeInPath(node.id)}
                        is2DMode={!activeNode}
                        exploration={exploration}
                        cyberneticMode={cyberneticMode}
                        layerChanged={!!layerChange}
                    />
                );
            })}
            
            <CameraController
                targetPosition={cameraSettings.position}
                targetLookAt={cameraSettings.lookAt}
                is2DMode={cameraSettings.is2DMode}
            />
        </>
    );
};

// ==== Feedback Panel ====
interface FeedbackPanelProps {
    nodeId: string;
    nodeLabel: string;
    onFeedback: (nodeId: string, type: 'insightful' | 'neutral' | 'familiar') => void;
    onClose: () => void;
}

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({ nodeId, nodeLabel, onFeedback, onClose }) => {
    return (
        <div
            style={{
                position: 'absolute',
                bottom: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(10,10,15,0.95)',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '16px 20px',
                color: '#ffffff',
                zIndex: 3,
                minWidth: 400,
            }}
        >
            <div style={{ fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
                How valuable was exploring <strong>{nodeLabel}</strong>?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                    onClick={() => {
                        onFeedback(nodeId, 'insightful');
                        onClose();
                    }}
                    style={{
                        background: 'rgba(78, 205, 196, 0.2)',
                        border: '1px solid rgba(78, 205, 196, 0.5)',
                        color: '#4ECDC4',
                        borderRadius: 8,
                        padding: '10px 20px',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                    }}
                >
                    🔍 Insightful
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>New perspective</div>
                </button>
                <button
                    onClick={() => {
                        onFeedback(nodeId, 'neutral');
                        onClose();
                    }}
                    style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#ffffff',
                        borderRadius: 8,
                        padding: '10px 20px',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                    }}
                >
                    ➖ Neutral
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>Familiar info</div>
                </button>
                <button
                    onClick={() => {
                        onFeedback(nodeId, 'familiar');
                        onClose();
                    }}
                    style={{
                        background: 'rgba(243, 129, 129, 0.2)',
                        border: '1px solid rgba(243, 129, 129, 0.5)',
                        color: '#F38181',
                        borderRadius: 8,
                        padding: '10px 20px',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                    }}
                >
                    🔁 Too Familiar
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>Already known</div>
                </button>
            </div>
        </div>
    );
};

// ==== Exploration Stats Panel ====
interface ExplorationStatsPanelProps {
    explorationData: Map<string, NodeExploration>;
    nodes: RawNode[];
}

const ExplorationStatsPanel: React.FC<ExplorationStatsPanelProps> = ({ explorationData, nodes }) => {
    const stats = useMemo(() => {
        let totalExplored = 0;
        let totalInsightful = 0;
        let totalNeutral = 0;
        let totalFamiliar = 0;
        
        explorationData.forEach(data => {
            if (data.visits > 0) totalExplored++;
            totalInsightful += data.insightful;
            totalNeutral += data.neutral;
            totalFamiliar += data.familiar;
        });
        
        const explorationRate = (totalExplored / nodes.length) * 100;
        const underExplored = nodes.length - totalExplored;
        
        return {
            explorationRate: explorationRate.toFixed(0),
            underExplored,
            totalInsightful,
            totalNeutral,
            totalFamiliar
        };
    }, [explorationData, nodes]);
    
    return (
        <div
            style={{
                position: 'absolute',
                bottom: 20,
                right: 20,
                background: 'rgba(10,10,15,0.9)',
                borderRadius: 12,
                border: '1px solid rgba(170, 150, 218, 0.3)',
                padding: '16px',
                color: '#ffffff',
                zIndex: 2,
                minWidth: 220,
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#AA96DA' }}>
                Exploration Stats
            </div>
            <div style={{ fontSize: 12, color: '#cccccc', lineHeight: 1.8 }}>
                <div>Network Coverage: <strong>{stats.explorationRate}%</strong></div>
                <div>Under-explored: <strong>{stats.underExplored}</strong> nodes</div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div>🔍 Insightful: {stats.totalInsightful}</div>
                    <div>➖ Neutral: {stats.totalNeutral}</div>
                    <div>🔁 Familiar: {stats.totalFamiliar}</div>
                </div>
            </div>
            <div style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid rgba(255,255,255,0.1)',
                fontSize: 10,
                color: '#888888',
                fontStyle: 'italic'
            }}>
                Nodes with ↕️ changed layers based on feedback
            </div>
        </div>
    );
};

// ==== Left Panel Component ====
interface LeftPanelProps {
    activeNode: string | null;
    layers: NodeLayer[];
    previousLayers: NodeLayer[];
    nodes: RawNode[];
    getNodeColor: (id: string) => string;
    onClose: () => void;
    cyberneticMode: boolean;
}

const LeftPanel: React.FC<LeftPanelProps> = ({
                                                 activeNode,
                                                 layers,
                                                 previousLayers,
                                                 nodes,
                                                 getNodeColor,
                                                 onClose,
                                                 cyberneticMode
                                             }) => {
    if (!activeNode || layers.length === 0) return null;
    
    const getNodeLabel = (id: string) => {
        return nodes.find(n => n.id === id)?.label || id;
    };
    
    // Get previous layer for each node
    const previousLayerMap = useMemo(() => {
        const map = new Map<string, number>();
        previousLayers.forEach(layer => {
            layer.nodes.forEach(nodeId => {
                map.set(nodeId, layer.level);
            });
        });
        return map;
    }, [previousLayers]);
    
    // Count layer changes
    const layerChanges = useMemo(() => {
        let promoted = 0;
        let demoted = 0;
        
        layers.forEach(layer => {
            layer.nodes.forEach(nodeId => {
                const prevLevel = previousLayerMap.get(nodeId);
                if (prevLevel !== undefined && prevLevel !== layer.level) {
                    if (layer.level < prevLevel) promoted++;
                    else demoted++;
                }
            });
        });
        
        return { promoted, demoted };
    }, [layers, previousLayerMap]);
    
    return (
        <div
            style={{
                position: 'absolute',
                top: 20,
                left: 20,
                width: 320,
                maxHeight: 'calc(100vh - 40px)',
                background: 'rgba(10,10,15,0.95)',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '20px',
                color: '#ffffff',
                overflow: 'auto',
                zIndex: 2,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
                <div>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                        {getNodeLabel(activeNode)}
                    </div>
                    <div style={{ fontSize: 12, color: '#aaaaaa' }}>
                        Hierarchical Network Path
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#ffffff',
                        borderRadius: 6,
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                    }}
                >
                    Close
                </button>
            </div>
            
            {cyberneticMode && (layerChanges.promoted > 0 || layerChanges.demoted > 0) && previousLayers.length > 0 && (
                <div style={{
                    background: 'rgba(255, 170, 0, 0.1)',
                    border: '1px solid rgba(255, 170, 0, 0.3)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    marginBottom: 16,
                    fontSize: 12,
                    color: '#ffaa00'
                }}>
                    ↕️ Layers reorganized!
                    <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
                        ↑ {layerChanges.promoted} promoted • ↓ {layerChanges.demoted} demoted
                    </div>
                </div>
            )}
            
            <div style={{
                fontSize: 13,
                color: '#cccccc',
                lineHeight: 1.5,
                marginBottom: 20,
                paddingBottom: 20,
                borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}>
                {cyberneticMode ? (
                    <>
                        Layers are <strong>reordered</strong> by feedback: <strong>insightful</strong> nodes promoted to earlier layers, <strong>familiar</strong> nodes demoted to later layers.
                    </>
                ) : (
                    <>
                        This view shows the hierarchical connections from the selected node.
                        Each layer represents nodes at increasing distances from the source.
                    </>
                )}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {layers.map((layer, idx) => (
                    <div key={idx}>
                        <div style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#888888',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8
                        }}>
                            {idx === 0 ? 'Source' : `Layer ${idx}`}
                        </div>
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8
                        }}>
                            {layer.nodes.map(nodeId => {
                                const color = getNodeColor(nodeId);
                                const prevLevel = previousLayerMap.get(nodeId);
                                const levelChanged = prevLevel !== undefined && prevLevel !== layer.level;
                                const wasPromoted = prevLevel !== undefined && layer.level < prevLevel;
                                const wasDemoted = prevLevel !== undefined && layer.level > prevLevel;
                                
                                return (
                                    <div
                                        key={nodeId}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: 20,
                                            fontSize: 12,
                                            background: levelChanged ? 'rgba(255, 170, 0, 0.15)' : `${color}22`,
                                            border: levelChanged ? '1px solid #ffaa00' : `1px solid ${color}`,
                                            color: '#ffffff',
                                            boxShadow: levelChanged ? '0 0 12px rgba(255, 170, 0, 0.4)' : `0 0 8px ${color}44`,
                                        }}
                                    >
                                        {getNodeLabel(nodeId)}
                                        {wasPromoted && <span style={{ marginLeft: 4 }}>↑</span>}
                                        {wasDemoted && <span style={{ marginLeft: 4 }}>↓</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ==== Main Wrapper Component ====
const CyberneticTopoMap: React.FC = () => {
    const nodes = data.nodes as RawNode[];
    const links = data.links as RawLink[];
    const [activeNode, setActiveNode] = useState<string | null>(null);
    const [hierarchicalLayers, setHierarchicalLayers] = useState<NodeLayer[]>([]);
    const [previousLayers, setPreviousLayers] = useState<NodeLayer[]>([]);
    const [cyberneticMode, setCyberneticMode] = useState(false);
    const [layout2D, setLayout2D] = useState<Map<string, { x: number; y: number; vx: number; vy: number }>>(
        () => forceDirectedLayout(nodes, links, false)
    );
    const [explorationData, setExplorationData] = useState<Map<string, NodeExploration>>(() => {
        const map = new Map<string, NodeExploration>();
        nodes.forEach(node => {
            map.set(node.id, { visits: 0, insightful: 0, neutral: 0, familiar: 0 });
        });
        return map;
    });
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackNodeId, setFeedbackNodeId] = useState<string | null>(null);
    
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
    
    const handleNodeClick = (id: string) => {
        if (activeNode === id) {
            // Show feedback before closing
            if (cyberneticMode) {
                setFeedbackNodeId(id);
                setShowFeedback(true);
            }
            setActiveNode(null);
            setHierarchicalLayers([]);
            setPreviousLayers([]);
        } else {
            // Save previous layers before updating
            if (hierarchicalLayers.length > 0 && cyberneticMode) {
                setPreviousLayers(hierarchicalLayers);
            }
            
            setActiveNode(id);
            const newLayers = getAdaptiveHierarchicalLayers(id, links, explorationData, cyberneticMode);
            setHierarchicalLayers(newLayers);
            
            // Track visit
            setExplorationData(prev => {
                const newMap = new Map(prev);
                const current = newMap.get(id)!;
                newMap.set(id, { ...current, visits: current.visits + 1 });
                return newMap;
            });
            
            // Show feedback after a moment
            if (cyberneticMode) {
                setTimeout(() => {
                    setFeedbackNodeId(id);
                    setShowFeedback(true);
                }, 1500);
            }
        }
    };
    
    const handleFeedback = (nodeId: string, type: 'insightful' | 'neutral' | 'familiar') => {
        // Update exploration data
        const newExplorationData = new Map(explorationData);
        const current = newExplorationData.get(nodeId)!;
        newExplorationData.set(nodeId, {
            ...current,
            [type]: current[type] + 1
        });
        setExplorationData(newExplorationData);
        
        // Regenerate path with updated feedback
        if (activeNode && cyberneticMode) {
            setPreviousLayers(hierarchicalLayers);
            const newLayers = getAdaptiveHierarchicalLayers(activeNode, links, newExplorationData, cyberneticMode);
            setHierarchicalLayers(newLayers);
        }
    };
    
    const handleClose = () => {
        setActiveNode(null);
        setHierarchicalLayers([]);
        setPreviousLayers([]);
    };
    
    const handleRandomize = () => {
        if (!activeNode) {
            setLayout2D(forceDirectedLayout(nodes, links, true));
        }
    };
    
    const toggleCyberneticMode = () => {
        setCyberneticMode(!cyberneticMode);
        // Regenerate current path if one is active
        if (activeNode) {
            setPreviousLayers(hierarchicalLayers);
            const newLayers = getAdaptiveHierarchicalLayers(activeNode, links, explorationData, !cyberneticMode);
            setHierarchicalLayers(newLayers);
        }
    };
    
    const getNodeLabel = (id: string) => {
        return nodes.find(n => n.id === id)?.label || id;
    };
    
    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                background: cyberneticMode
                    ? 'radial-gradient(circle at top, #1a0a2e 0, #050509 60%)'
                    : 'radial-gradient(circle at top, #151822 0, #050509 60%)',
                position: 'relative',
                color: '#ffffff',
                overflow: 'hidden',
            }}
        >
            {/* Control buttons */}
            {!activeNode && (
                <div
                    style={{
                        position: 'absolute',
                        top: 20,
                        right: 20,
                        display: 'flex',
                        gap: 10,
                        zIndex: 2,
                    }}
                >
                    <button
                        onClick={handleRandomize}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#ffffff',
                            borderRadius: 8,
                            padding: '10px 16px',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 500,
                        }}
                    >
                        Randomize
                    </button>
                    <button
                        onClick={toggleCyberneticMode}
                        style={{
                            background: cyberneticMode
                                ? 'rgba(170, 150, 218, 0.3)'
                                : 'rgba(255,255,255,0.1)',
                            border: cyberneticMode
                                ? '1px solid rgba(170, 150, 218, 0.6)'
                                : '1px solid rgba(255,255,255,0.2)',
                            color: '#ffffff',
                            borderRadius: 8,
                            padding: '10px 16px',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 500,
                            boxShadow: cyberneticMode ? '0 0 12px rgba(170, 150, 218, 0.5)' : 'none',
                        }}
                    >
                        {cyberneticMode ? 'Cybernetic: ON' : 'Cybernetic: OFF'}
                    </button>
                </div>
            )}
            
            {/* Overview Description */}
            {!activeNode && (
                <div
                    style={{
                        position: 'absolute',
                        top: 20,
                        left: 20,
                        padding: '14px 18px',
                        background: 'rgba(10,10,15,0.9)',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.08)',
                        maxWidth: 340,
                        fontSize: 12,
                        lineHeight: 1.6,
                        zIndex: 2,
                    }}
                >
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                        Design Discovery Map
                    </div>
                    <div style={{ color: '#aaaaaa' }}>
                        {cyberneticMode ? (
                            <>
                                Cybernetic mode <strong>reorganizes layers</strong> based on feedback: insightful nodes ↑ to earlier layers, familiar nodes ↓ to later layers. Visual opacity changes reflect your exploration patterns.
                            </>
                        ) : (
                            <>
                                A living, self-regulating design system where each decision creates feedback loops throughout the map.
                            </>
                        )}
                    </div>
                    <div style={{ marginTop: 12, color: '#888888', fontSize: 11 }}>
                        Click any node to explore • Scroll to zoom
                        {cyberneticMode && ' • Your feedback reshapes the hierarchy'}
                    </div>
                </div>
            )}
            
            {/* Exploration Stats Panel */}
            {cyberneticMode && !activeNode && (
                <ExplorationStatsPanel explorationData={explorationData} nodes={nodes} />
            )}
            
            {/* Feedback Panel */}
            {showFeedback && feedbackNodeId && (
                <FeedbackPanel
                    nodeId={feedbackNodeId}
                    nodeLabel={getNodeLabel(feedbackNodeId)}
                    onFeedback={handleFeedback}
                    onClose={() => setShowFeedback(false)}
                />
            )}
            
            {/* Left Panel */}
            <LeftPanel
                activeNode={activeNode}
                layers={hierarchicalLayers}
                previousLayers={previousLayers}
                nodes={nodes}
                getNodeColor={getNodeColor}
                onClose={handleClose}
                cyberneticMode={cyberneticMode}
            />
            
            <Canvas shadows camera={{ position: [0, 16, 0.1], fov: 45 }}>
                <CyberneticTopoScene
                    activeNode={activeNode}
                    hierarchicalLayers={hierarchicalLayers}
                    onNodeClick={handleNodeClick}
                    cyberneticMode={cyberneticMode}
                    layout2D={layout2D}
                    explorationData={explorationData}
                    previousLayers={previousLayers}
                />
            </Canvas>
        </div>
    );
};

export default CyberneticTopoMap;