import React, { useState } from 'react';

interface HistoryEntry {
  path: string;
  version: number;
  timestamp: string;
  author: string;
  reason: string;
  diff_summary: string;
  checksum: string;
}

export function TimelineEntry({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);

  const dateStr = new Date(entry.timestamp).toLocaleString();

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        padding: '0.75rem',
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{entry.path}</strong>
          <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>v{entry.version}</span>
        </div>
        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>{dateStr}</div>
      </div>
      <div style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.25rem' }}>
        {entry.reason}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
        by {entry.author}
      </div>
      {expanded && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px', fontSize: '0.875rem' }}>
          <div><strong>Diff:</strong> {entry.diff_summary || 'No diff available'}</div>
          <div style={{ marginTop: '0.25rem', color: '#9ca3af' }}>Checksum: {entry.checksum}</div>
        </div>
      )}
    </div>
  );
}
