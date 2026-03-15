import React, { useState } from 'react';

interface Conflict {
  section: string;
  key: string;
  ours: unknown;
  theirs: unknown;
  ours_author: string;
  theirs_author: string;
}

interface Props {
  path: string;
  conflicts: Conflict[];
  onResolved: () => void;
}

export function ConflictResolver({ path, conflicts, onResolved }: Props) {
  const [resolving, setResolving] = useState(false);

  const resolve = async (section: string, key: string, choice: string) => {
    setResolving(true);
    try {
      const res = await fetch('/api/v1/conflicts/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, section, key, choice }),
      });
      if (res.ok) {
        onResolved();
      }
    } catch (err) {
      console.error('Failed to resolve conflict:', err);
    }
    setResolving(false);
  };

  return (
    <div style={{ marginTop: '0.75rem' }}>
      {conflicts.map((conflict, i) => (
        <div key={`${conflict.section}-${conflict.key}-${i}`} style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {conflict.section} / {conflict.key}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ padding: '0.5rem', background: '#dbeafe', borderRadius: '4px', fontSize: '0.8rem' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Ours ({conflict.ours_author})</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                {JSON.stringify(conflict.ours, null, 2)}
              </pre>
            </div>
            <div style={{ padding: '0.5rem', background: '#fef9c3', borderRadius: '4px', fontSize: '0.8rem' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Theirs ({conflict.theirs_author})</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                {JSON.stringify(conflict.theirs, null, 2)}
              </pre>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              disabled={resolving}
              onClick={() => resolve(conflict.section, conflict.key, 'pick_ours')}
              style={{ padding: '0.25rem 0.75rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Pick Ours
            </button>
            <button
              disabled={resolving}
              onClick={() => resolve(conflict.section, conflict.key, 'pick_theirs')}
              style={{ padding: '0.25rem 0.75rem', background: '#eab308', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Pick Theirs
            </button>
            <button
              disabled={resolving}
              onClick={() => resolve(conflict.section, conflict.key, 'keep_both')}
              style={{ padding: '0.25rem 0.75rem', background: '#6b7280', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Keep Both
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
