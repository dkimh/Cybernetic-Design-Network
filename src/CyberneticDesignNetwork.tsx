import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import data from '../public/data.json';

interface Node extends d3.SimulationNodeDatum {
    id: string;
    label: string;
    color?: string;
    size?: number;
    level?: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
    source: string | Node;
    target: string | Node;
}

interface NodeInfo {
    name: string;
    connections: number;
    incoming: number;
    outgoing: number;
}

const CyberneticDesignNetwork: React.FC = () => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
    const [animationRunning, setAnimationRunning] = useState(true);
    const [isRandomized, setIsRandomized] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [nodePath, setNodePath] = useState<string[]>([]);
    const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
    const activeNodeRef = useRef<string | null>(null);
    const originalLinksRef = useRef<Link[]>([]);
    const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const gRef = useRef<SVGGElement | null>(null);
    
    // Define color scheme based on node hierarchy
    const getNodeColor = (nodeId: string): string => {
        // Main categories (level 1)
        const mainCategories: Record<string, string> = {
            form: '#4ECDC4',
            function: '#95E1D3',
            material: '#FF6B6B',
            emotion: '#F38181',
            process: '#AA96DA',
        };
        
        // Secondary nodes (level 2)
        const secondaryColors: Record<string, string> = {
            // Form related
            balance: '#5FD9D1',
            modularity: '#6FE4DC',
            scale: '#7FEFE7',
            geometry: '#8FF5F2',
            visual: '#9FFAFD',
            structure: '#3FC1B9',
            composition: '#AFFFFF', // Form-related (lightest teal)
            
            // Function related
            adaptability: '#A5EBE3',
            ergonomics: '#B5F6EE',
            usability: '#85D6CE',
            maintenance: '#75CBC3',
            
            // Material related
            sustainability: '#FF8B8B',
            texture: '#FFA5A5',
            materialChoice: '#FF7171',
            aging: '#FF5757',
            thermal: '#FFBFBF', // Material-related (lighter red)
            
            // Emotion related
            cultural: '#F59B9B',
            emotionNode: '#FAB1B1',
            storytelling: '#FF8181',
            identity: '#FF6767',
            
            // Process related
            cost: '#BAA6E0',
            fabrication: '#CAB6F0',
            assembly: '#AA96DA',
            supplyChain: '#DAC6FA', // Process-related (lighter purple)
            feedbackLoop: '#FCBAD3',
        };
        
        return mainCategories[nodeId] || secondaryColors[nodeId] || '#A0A0A0';
    };
    
    // Calculate node size based on connections
    const getNodeSize = (nodeId: string, links: Link[]): number => {
        const mainNodes = ['form', 'function', 'material', 'emotion', 'process'];
        
        if (mainNodes.includes(nodeId)) {
            return 55; // All main nodes are large
        }
        
        // Special node: feedbackLoop is also important
        if (nodeId === 'feedbackLoop') {
            return 50;
        }
        
        const connectionCount = links.filter(
            (l) =>
                (typeof l.source === 'string' ? l.source : l.source.id) === nodeId ||
                (typeof l.target === 'string' ? l.target : l.target.id) === nodeId
        ).length;
        
        return Math.max(25, Math.min(45, 25 + connectionCount * 3));
    };
    
    // Process data from JSON
    const processedNodes: Node[] = data.nodes.map((node) => ({
        ...node,
        color: getNodeColor(node.id),
        size: getNodeSize(node.id, data.links),
    }));
    
    const processedLinks: Link[] = data.links.map((link) => ({
        source: link.source,
        target: link.target,
    }));
    
    // Store original links on first render
    if (originalLinksRef.current.length === 0) {
        originalLinksRef.current = processedLinks.map(link => ({ ...link }));
    }
    
    // Function to randomize connections
    const randomizeConnections = () => {
        const nodeIds = processedNodes.map(n => n.id);
        const newLinks: Link[] = [];
        const usedPairs = new Set<string>();
        const outgoingCount = new Map<string, number>();
        const incomingCount = new Map<string, number>();
        
        // Initialize counts
        nodeIds.forEach(id => {
            outgoingCount.set(id, 0);
            incomingCount.set(id, 0);
        });
        
        const minConnectionsPerNode = 3;
        
        // First pass: Ensure each node has at least 3 outgoing connections
        for (const sourceNode of nodeIds) {
            while ((outgoingCount.get(sourceNode) || 0) < minConnectionsPerNode) {
                const targetNode = nodeIds[Math.floor(Math.random() * nodeIds.length)];
                const pairKey = `${sourceNode}-${targetNode}`;
                
                if (sourceNode !== targetNode && !usedPairs.has(pairKey)) {
                    newLinks.push({ source: sourceNode, target: targetNode });
                    usedPairs.add(pairKey);
                    outgoingCount.set(sourceNode, (outgoingCount.get(sourceNode) || 0) + 1);
                    incomingCount.set(targetNode, (incomingCount.get(targetNode) || 0) + 1);
                }
            }
        }
        
        // Second pass: Ensure each node has at least 3 incoming connections
        for (const targetNode of nodeIds) {
            while ((incomingCount.get(targetNode) || 0) < minConnectionsPerNode) {
                const sourceNode = nodeIds[Math.floor(Math.random() * nodeIds.length)];
                const pairKey = `${sourceNode}-${targetNode}`;
                
                if (sourceNode !== targetNode && !usedPairs.has(pairKey)) {
                    newLinks.push({ source: sourceNode, target: targetNode });
                    usedPairs.add(pairKey);
                    outgoingCount.set(sourceNode, (outgoingCount.get(sourceNode) || 0) + 1);
                    incomingCount.set(targetNode, (incomingCount.get(targetNode) || 0) + 1);
                }
            }
        }
        
        // Third pass: Add more random connections to reach original total if needed
        const targetNumLinks = originalLinksRef.current.length;
        let attempts = 0;
        const maxAttempts = targetNumLinks * 10;
        
        while (newLinks.length < targetNumLinks && attempts < maxAttempts) {
            attempts++;
            const source = nodeIds[Math.floor(Math.random() * nodeIds.length)];
            const target = nodeIds[Math.floor(Math.random() * nodeIds.length)];
            
            const pairKey = `${source}-${target}`;
            if (source !== target && !usedPairs.has(pairKey)) {
                newLinks.push({ source, target });
                usedPairs.add(pairKey);
                outgoingCount.set(source, (outgoingCount.get(source) || 0) + 1);
                incomingCount.set(target, (incomingCount.get(target) || 0) + 1);
            }
        }
        
        return newLinks;
    };
    
    // Function to find paths from a node (BFS to get all reachable nodes)
    const findNodePaths = (nodeId: string, links: Link[]): string[] => {
        const visited = new Set<string>();
        const queue: string[] = [nodeId];
        const path: string[] = [];
        
        while (queue.length > 0) {
            const current = queue.shift()!;
            
            if (visited.has(current)) continue;
            visited.add(current);
            path.push(current);
            
            // Find all nodes connected from current
            const connectedNodes = links
                .filter(l => {
                    const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
                    return sourceId === current;
                })
                .map(l => typeof l.target === 'string' ? l.target : l.target.id);
            
            queue.push(...connectedNodes);
        }
        
        return path;
    };
    
    const [currentLinks, setCurrentLinks] = useState<Link[]>(processedLinks);
    
    useEffect(() => {
        if (!svgRef.current) return;
        
        const svg = d3.select(svgRef.current);
        const width = svgRef.current.clientWidth;
        const height = svgRef.current.clientHeight;
        
        // Clear previous content
        svg.selectAll('*').remove();
        
        // Create main group for zoom/pan
        const g = svg.append('g');
        gRef.current = g.node();
        
        // Setup zoom behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
                setZoomLevel(event.transform.k);
            });
        
        svg.call(zoom);
        zoomBehaviorRef.current = zoom;
        
        // Define arrow markers
        const defs = svg.append('defs');
        
        defs
            .selectAll('marker')
            .data(['arrow', 'arrow-active'])
            .enter()
            .append('marker')
            .attr('id', (d) => d)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('class', (d) => (d === 'arrow-active' ? 'arrow active' : 'arrow'));
        
        // Create force simulation
        const simulation = d3
            .forceSimulation<Node>(processedNodes)
            .force(
                'link',
                d3
                    .forceLink<Node, Link>(currentLinks)
                    .id((d) => d.id)
                    .distance(180)
            )
            .force('charge', d3.forceManyBody<Node>().strength(-1200))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force(
                'collision',
                d3.forceCollide<Node>().radius((d) => (d.size || 30) + 25)
            );
        
        simulationRef.current = simulation;
        
        // Create links
        const linkGroup = g.append('g');
        const link = linkGroup
            .selectAll('path')
            .data(currentLinks)
            .enter()
            .append('path')
            .attr('class', 'link')
            .attr('stroke', 'rgba(255, 255, 255, 0.15)')
            .attr('stroke-width', 1.5)
            .attr('fill', 'none')
            .attr('marker-end', 'url(#arrow)');
        
        // Create node groups
        const nodeGroup = g.append('g');
        const node = nodeGroup
            .selectAll('g')
            .data(processedNodes)
            .enter()
            .append('g')
            .attr('class', 'node')
            .style('cursor', 'pointer')
            .call(
                d3
                    .drag<SVGGElement, Node>()
                    .on('start', (event, d) => {
                        if (!event.active) simulation.alphaTarget(0.3).restart();
                        d.fx = d.x;
                        d.fy = d.y;
                    })
                    .on('drag', (event, d) => {
                        d.fx = event.x;
                        d.fy = event.y;
                    })
                    .on('end', (event, d) => {
                        if (!event.active) simulation.alphaTarget(0);
                        d.fx = null;
                        d.fy = null;
                    })
            )
            .on('click', (event, d) => {
                event.stopPropagation();
                handleNodeClick(d);
            });
        
        // Add circles to nodes
        node
            .append('circle')
            .attr('r', (d) => d.size || 30)
            .attr('fill', (d) => d.color || '#A0A0A0')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 2);
        
        // Add labels to nodes
        node
            .append('text')
            .attr('class', 'node-label')
            .attr('dy', (d) => (d.size || 30) + 18)
            .attr('text-anchor', 'middle')
            .attr('fill', '#ffffff')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .style('pointer-events', 'none')
            .style('text-shadow', '0 0 4px rgba(0, 0, 0, 0.8)')
            .text((d) => d.label);
        
        // Handle node click
        const handleNodeClick = (d: Node) => {
            // Reset previous selection
            node.classed('active', false);
            node.selectAll('circle').style('filter', 'none');
            link
                .classed('active', false)
                .attr('stroke', 'rgba(255, 255, 255, 0.15)')
                .attr('stroke-width', 1.5)
                .attr('marker-end', 'url(#arrow)');
            
            if (activeNodeRef.current === d.id) {
                activeNodeRef.current = null;
                setNodeInfo(null);
                setNodePath([]);
                return;
            }
            
            activeNodeRef.current = d.id;
            
            // Find all nodes in the path from this node
            const pathNodes = findNodePaths(d.id, currentLinks);
            setNodePath(pathNodes);
            
            // Highlight selected node
            node
                .filter((n) => n.id === d.id)
                .classed('active', true)
                .selectAll('circle')
                .style('filter', 'brightness(1.5) drop-shadow(0 0 20px currentColor)');
            
            // Highlight connected links
            link
                .filter(
                    (l) =>
                        (l.source as Node).id === d.id || (l.target as Node).id === d.id
                )
                .classed('active', true)
                .attr('stroke', 'rgba(0, 212, 255, 0.6)')
                .attr('stroke-width', 2.5)
                .attr('marker-end', 'url(#arrow-active)');
            
            // Calculate connection info
            const outgoingLinks = currentLinks.filter(
                (l) =>
                    (typeof l.source === 'string' ? l.source : l.source.id) === d.id
            );
            const incomingLinks = currentLinks.filter(
                (l) =>
                    (typeof l.target === 'string' ? l.target : l.target.id) === d.id
            );
            
            setNodeInfo({
                name: d.label,
                connections: outgoingLinks.length + incomingLinks.length,
                outgoing: outgoingLinks.length,
                incoming: incomingLinks.length,
            });
            
            // Animate feedback propagation
            propagateFeedback(d.id, node);
        };
        
        // Animate feedback propagation
        const propagateFeedback = (
            sourceId: string,
            nodeSelection: d3.Selection<SVGGElement, Node, SVGGElement, unknown>,
            depth = 0,
            visited = new Set<string>()
        ) => {
            if (depth > 3 || visited.has(sourceId)) return;
            visited.add(sourceId);
            
            const connectedLinks = currentLinks.filter(
                (l) => (typeof l.source === 'string' ? l.source : l.source.id) === sourceId
            );
            
            connectedLinks.forEach((l, i) => {
                setTimeout(() => {
                    const targetId = typeof l.target === 'string' ? l.target : l.target.id;
                    const targetNode = nodeSelection.filter((n) => n.id === targetId);
                    
                    targetNode
                        .select('circle')
                        .transition()
                        .duration(300)
                        .attr('r', (d) => (d.size || 30) * 1.3)
                        .transition()
                        .duration(300)
                        .attr('r', (d) => d.size || 30);
                    
                    setTimeout(() => {
                        propagateFeedback(targetId, nodeSelection, depth + 1, visited);
                    }, 200);
                }, i * 150);
            });
        };
        
        // Update positions on simulation tick
        simulation.on('tick', () => {
            link.attr('d', (d) => {
                const source = d.source as Node;
                const target = d.target as Node;
                const dx = target.x! - source.x!;
                const dy = target.y! - source.y!;
                const dr = Math.sqrt(dx * dx + dy * dy);
                return `M${source.x},${source.y}A${dr},${dr} 0 0,1 ${target.x},${target.y}`;
            });
            
            node.attr('transform', (d) => `translate(${d.x},${d.y})`);
        });
        
        // Click outside to deselect
        svg.on('click', () => {
            activeNodeRef.current = null;
            node.classed('active', false);
            node.selectAll('circle').style('filter', 'none');
            link
                .classed('active', false)
                .attr('stroke', 'rgba(255, 255, 255, 0.15)')
                .attr('stroke-width', 1.5)
                .attr('marker-end', 'url(#arrow)');
            setNodeInfo(null);
            setNodePath([]);
        });
        
        // Cleanup
        return () => {
            simulation.stop();
        };
    }, [currentLinks]);
    
    useEffect(() => {
        if (simulationRef.current) {
            if (animationRunning) {
                simulationRef.current.alpha(0.3).restart();
            } else {
                simulationRef.current.stop();
            }
        }
    }, [animationRunning]);
    
    const resetSimulation = () => {
        activeNodeRef.current = null;
        setNodeInfo(null);
        setNodePath([]);
        if (simulationRef.current) {
            simulationRef.current.alpha(1).restart();
        }
    };
    
    const randomPulse = () => {
        const randomNode = processedNodes[Math.floor(Math.random() * processedNodes.length)];
        activeNodeRef.current = randomNode.id;
    };
    
    const toggleRandomize = () => {
        if (isRandomized) {
            // Restore original connections
            setCurrentLinks(originalLinksRef.current.map(link => ({ ...link })));
            setIsRandomized(false);
        } else {
            // Generate random connections
            const randomLinks = randomizeConnections();
            setCurrentLinks(randomLinks);
            setIsRandomized(true);
        }
        
        // Clear any active node selection
        activeNodeRef.current = null;
        setNodeInfo(null);
        setNodePath([]);
    };
    
    const handleZoomIn = () => {
        if (svgRef.current && zoomBehaviorRef.current) {
            d3.select(svgRef.current)
                .transition()
                .duration(300)
                .call(zoomBehaviorRef.current.scaleBy, 1.3);
        }
    };
    
    const handleZoomOut = () => {
        if (svgRef.current && zoomBehaviorRef.current) {
            d3.select(svgRef.current)
                .transition()
                .duration(300)
                .call(zoomBehaviorRef.current.scaleBy, 0.7);
        }
    };
    
    const legendItems = [
        { color: '#4ECDC4', label: 'Form' },
        { color: '#95E1D3', label: 'Function' },
        { color: '#FF6B6B', label: 'Material' },
        { color: '#F38181', label: 'Emotion & Aesthetics' },
        { color: '#AA96DA', label: 'Process' },
        { color: '#FCBAD3', label: 'Feedback Loop' },
    ];
    
    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0a0a0a' }}>
            {/* Info Panel */}
            <div
                style={{
                    position: 'absolute',
                    top: '20px',
                    left: '20px',
                    background: 'rgba(20, 20, 20, 0.9)',
                    padding: '20px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    maxWidth: '300px',
                    backdropFilter: 'blur(10px)',
                    color: '#fff',
                    zIndex: 10,
                }}
            >
                <h1 style={{ fontSize: '18px', marginBottom: '10px', color: '#ffffff' }}>
                    Cybernetic Design Network
                </h1>
                <p style={{ fontSize: '12px', lineHeight: '1.6', color: '#999', marginBottom: '15px' }}>
                    Click on nodes to see feedback loops. Each decision ripples through the system, creating
                    a living, evolving design process.
                </p>
                {nodeInfo && (
                    <div
                        style={{
                            marginTop: '15px',
                            paddingTop: '15px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                    >
                        <h2 style={{ fontSize: '14px', marginBottom: '8px', color: '#4ECDC4' }}>
                            {nodeInfo.name}
                        </h2>
                        <div style={{ fontSize: '11px', color: '#666', marginBottom: '5px' }}>
                            Total connections: {nodeInfo.connections}
                        </div>
                        <div style={{ fontSize: '11px', color: '#666', marginBottom: '5px' }}>
                            Outgoing: {nodeInfo.outgoing} | Incoming: {nodeInfo.incoming}
                        </div>
                        {nodePath.length > 1 && (
                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                <div style={{ fontSize: '11px', color: '#4ECDC4', marginBottom: '5px', fontWeight: '600' }}>
                                    Connection Path:
                                </div>
                                <div style={{ fontSize: '10px', color: '#999', lineHeight: '1.5' }}>
                                    {nodePath.map((nodeId, index) => {
                                        const node = processedNodes.find(n => n.id === nodeId);
                                        return (
                                            <span key={nodeId}>
                        {node?.label}
                                                {index < nodePath.length - 1 && ' → '}
                      </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Controls */}
            <div
                style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    background: 'rgba(20, 20, 20, 0.9)',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 10,
                    maxWidth: '180px',
                    width: '180px',
                }}
            >
                <button
                    onClick={resetSimulation}
                    style={{
                        background: 'rgba(0, 212, 255, 0.2)',
                        border: '1px solid rgba(0, 212, 255, 0.5)',
                        color: '#00d4ff',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        marginBottom: '6px',
                        width: '100%',
                        transition: 'all 0.3s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
                    }}
                >
                    Reset System
                </button>
                <button
                    onClick={() => setAnimationRunning(!animationRunning)}
                    style={{
                        background: 'rgba(0, 212, 255, 0.2)',
                        border: '1px solid rgba(0, 212, 255, 0.5)',
                        color: '#00d4ff',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        marginBottom: '6px',
                        width: '100%',
                        transition: 'all 0.3s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
                    }}
                >
                    {animationRunning ? 'Pause' : 'Resume'} Animation
                </button>
                <button
                    onClick={randomPulse}
                    style={{
                        background: 'rgba(0, 212, 255, 0.2)',
                        border: '1px solid rgba(0, 212, 255, 0.5)',
                        color: '#00d4ff',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        marginBottom: '6px',
                        width: '100%',
                        transition: 'all 0.3s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
                    }}
                >
                    Random Input
                </button>
                <button
                    onClick={toggleRandomize}
                    style={{
                        background: isRandomized ? 'rgba(255, 107, 107, 0.2)' : 'rgba(0, 212, 255, 0.2)',
                        border: isRandomized ? '1px solid rgba(255, 107, 107, 0.5)' : '1px solid rgba(0, 212, 255, 0.5)',
                        color: isRandomized ? '#FF6B6B' : '#00d4ff',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        width: '100%',
                        transition: 'all 0.3s',
                    }}
                    onMouseEnter={(e) => {
                        if (isRandomized) {
                            e.currentTarget.style.background = 'rgba(255, 107, 107, 0.3)';
                        } else {
                            e.currentTarget.style.background = 'rgba(0, 212, 255, 0.3)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (isRandomized) {
                            e.currentTarget.style.background = 'rgba(255, 107, 107, 0.2)';
                        } else {
                            e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
                        }
                    }}
                >
                    {isRandomized ? 'Restore Original' : 'Randomize Connections'}
                </button>
            </div>
            
            {/* Zoom Controls */}
            <div
                style={{
                    position: 'absolute',
                    bottom: '220px',
                    right: '20px',
                    background: 'rgba(20, 20, 20, 0.9)',
                    padding: '10px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 10,
                    width: '180px',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                }}
            >
                <button
                    onClick={handleZoomOut}
                    style={{
                        background: 'rgba(0, 212, 255, 0.2)',
                        border: '1px solid rgba(0, 212, 255, 0.5)',
                        color: '#00d4ff',
                        padding: '8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        width: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s',
                        flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
                    }}
                >
                    −
                </button>
                <div style={{ fontSize: '11px', color: '#00d4ff', textAlign: 'center', flex: 1, fontWeight: '600' }}>
                    {Math.round(zoomLevel * 100)}%
                </div>
                <button
                    onClick={handleZoomIn}
                    style={{
                        background: 'rgba(0, 212, 255, 0.2)',
                        border: '1px solid rgba(0, 212, 255, 0.5)',
                        color: '#00d4ff',
                        padding: '8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        width: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s',
                        flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
                    }}
                >
                    +
                </button>
            </div>
            
            {/* Legend */}
            <div
                style={{
                    position: 'absolute',
                    bottom: '20px',
                    right: '20px',
                    background: 'rgba(20, 20, 20, 0.9)',
                    padding: '15px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 10,
                    width: '180px',
                }}
            >
                <h3 style={{ fontSize: '12px', marginBottom: '10px', color: '#fff' }}>
                    Main Categories
                </h3>
                {legendItems.map((item, index) => (
                    <div
                        key={index}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '8px',
                            fontSize: '11px',
                            color: '#fff',
                        }}
                    >
                        <div
                            style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: item.color,
                                marginRight: '8px',
                            }}
                        />
                        <span>{item.label}</span>
                    </div>
                ))}
            </div>
            
            {/* SVG */}
            <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
            
            {/* Styles */}
            <style>{`
        .arrow {
          fill: rgba(255, 255, 255, 0.3);
        }
        .arrow.active {
          fill: rgba(0, 212, 255, 0.8);
        }
        .node:hover circle {
          filter: brightness(1.3);
        }
      `}</style>
        </div>
    );
};

export default CyberneticDesignNetwork;