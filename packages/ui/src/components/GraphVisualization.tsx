import React, { useMemo } from 'react';

interface IndexEntry {
  path: string;
  summary: string;
  tags: string[];
  token_estimate: number;
  freshness: string;
}

interface GraphNode {
  path: string;
  depends_on: string[];
}

interface Props {
  entries: IndexEntry[];
  graph: Record<string, GraphNode>;
}

interface NodePosition {
  x: number;
  y: number;
  path: string;
  freshness: string;
}

export function GraphVisualization({ entries, graph }: Props) {
  const { nodes, edges } = useMemo(() => {
    const width = 800;
    const height = 400;
    const padding = 60;

    // Simple circular layout
    const nodePositions: NodePosition[] = entries.map((entry, i) => {
      const angle = (2 * Math.PI * i) / Math.max(entries.length, 1);
      const radius = Math.min(width, height) / 2 - padding;
      return {
        x: width / 2 + radius * Math.cos(angle),
        y: height / 2 + radius * Math.sin(angle),
        path: entry.path,
        freshness: entry.freshness || 'fresh',
      };
    });

    const edgeList: Array<{ from: NodePosition; to: NodePosition }> = [];
    for (const [path, node] of Object.entries(graph)) {
      const fromNode = nodePositions.find((n) => n.path === path);
      if (!fromNode) continue;
      for (const dep of node.depends_on || []) {
        const toNode = nodePositions.find((n) => n.path === dep);
        if (toNode) {
          edgeList.push({ from: fromNode, to: toNode });
        }
      }
    }

    return { nodes: nodePositions, edges: edgeList };
  }, [entries, graph]);

  const freshnessColor = (freshness: string) => {
    switch (freshness) {
      case 'stale': return '#ef4444';
      case 'warning': return '#f59e0b';
      default: return '#22c55e';
    }
  };

  if (entries.length === 0) {
    return <div style={{ color: '#6b7280', padding: '2rem', textAlign: 'center' }}>No index data available.</div>;
  }

  return (
    <svg width="800" height="400" style={{ border: '1px solid #e5e7eb', borderRadius: '6px', background: '#fafafa' }}>
      {/* Edges */}
      {edges.map((edge, i) => (
        <line
          key={`edge-${i}`}
          x1={edge.from.x}
          y1={edge.from.y}
          x2={edge.to.x}
          y2={edge.to.y}
          stroke="#d1d5db"
          strokeWidth={1}
          markerEnd="url(#arrow)"
        />
      ))}
      {/* Arrow marker */}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
        </marker>
      </defs>
      {/* Nodes */}
      {nodes.map((node) => (
        <g key={node.path}>
          <circle cx={node.x} cy={node.y} r={10} fill={freshnessColor(node.freshness)} stroke="#fff" strokeWidth={2} />
          <text x={node.x} y={node.y + 22} textAnchor="middle" fontSize="10" fill="#374151">
            {node.path.length > 20 ? '...' + node.path.slice(-17) : node.path}
          </text>
        </g>
      ))}
    </svg>
  );
}
