import React, { useEffect, useState } from 'react';
import { ConflictResolver } from '../components/ConflictResolver';

interface ConflictFile {
  path: string;
  conflict_count: number;
  conflicts: Array<{
    section: string;
    key: string;
    ours: unknown;
    theirs: unknown;
    ours_author: string;
    theirs_author: string;
  }>;
}

export function ConflictsPage() {
  const [files, setFiles] = useState<ConflictFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/conflicts')
      .then((res) => res.json())
      .then((data) => {
        setFiles(data.files || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleResolved = (path: string) => {
    setFiles((prev) => prev.filter((f) => f.path !== path));
    setExpandedPath(null);
  };

  if (loading) return <div>Loading conflicts...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

  return (
    <div>
      <h2>Conflicts</h2>
      {files.length === 0 ? (
        <p style={{ color: '#22c55e' }}>No conflicts found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {files.map((file) => (
            <div key={file.path} style={{ border: '1px solid #fecaca', borderRadius: '6px', padding: '0.75rem' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setExpandedPath(expandedPath === file.path ? null : file.path)}
              >
                <div>
                  <strong style={{ fontFamily: 'monospace' }}>{file.path}</strong>
                  <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>
                    {file.conflict_count} conflict{file.conflict_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <span>{expandedPath === file.path ? '−' : '+'}</span>
              </div>
              {expandedPath === file.path && (
                <ConflictResolver
                  path={file.path}
                  conflicts={file.conflicts}
                  onResolved={() => handleResolved(file.path)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
