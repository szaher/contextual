import React, { useEffect, useState } from 'react';
import { GraphVisualization } from '../components/GraphVisualization';

interface IndexEntry {
  path: string;
  summary: string;
  tags: string[];
  token_estimate: number;
  checksum: string;
  freshness: string;
}

interface GraphNode {
  path: string;
  depends_on: string[];
}

export function ContextMapPage() {
  const [entries, setEntries] = useState<IndexEntry[]>([]);
  const [graph, setGraph] = useState<Record<string, GraphNode>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/index')
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries || []);
        setGraph(data.graph || {});
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading context map...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

  return (
    <div>
      <h2>Context Map</h2>
      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
        {entries.length} .ctx files indexed
      </p>
      <GraphVisualization entries={entries} graph={graph} />
      <div style={{ marginTop: '1rem' }}>
        <h3>Index Entries</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Path</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Summary</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Tags</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.path} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{entry.path}</td>
                <td style={{ padding: '0.5rem' }}>{entry.summary}</td>
                <td style={{ padding: '0.5rem' }}>{entry.tags.join(', ')}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{entry.token_estimate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
