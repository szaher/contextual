import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCommitContext } from '../services/api';
import type { CommitContextItem } from '../services/api';

export function CommitHistoryPage() {
  const [commits, setCommits] = useState<CommitContextItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState('');
  const [trailersOnly, setTrailersOnly] = useState(true);

  useEffect(() => {
    // Get cwd from query params or use '.'
    const params = new URLSearchParams(window.location.search);
    const cwd = params.get('cwd') || '.';

    listCommitContext({
      cwd,
      session_id: sessionFilter || undefined,
      has_trailers: trailersOnly,
      limit: 100,
    })
      .then((data) => {
        setCommits(data.commits || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [sessionFilter, trailersOnly]);

  if (loading) return <div>Loading commit history...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

  return (
    <div>
      <h2>Commit History</h2>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Filter by session ID..."
          value={sessionFilter}
          onChange={(e) => setSessionFilter(e.target.value)}
          style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', width: '200px' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', color: '#6b7280' }}>
          <input
            type="checkbox"
            checked={trailersOnly}
            onChange={(e) => setTrailersOnly(e.target.checked)}
          />
          Trailers only
        </label>
      </div>

      {commits.length === 0 ? (
        <div style={{ color: '#9ca3af', padding: '2rem', textAlign: 'center' }}>
          No commits with context trailers found.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Hash</th>
              <th style={{ padding: '0.5rem' }}>Subject</th>
              <th style={{ padding: '0.5rem' }}>Author</th>
              <th style={{ padding: '0.5rem' }}>Session</th>
              <th style={{ padding: '0.5rem' }}>Files</th>
              <th style={{ padding: '0.5rem' }}>Entries</th>
              <th style={{ padding: '0.5rem' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {commits.map((commit) => (
              <tr key={commit.hash} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {commit.hash.substring(0, 8)}
                </td>
                <td style={{ padding: '0.5rem' }}>{commit.subject}</td>
                <td style={{ padding: '0.5rem', color: '#6b7280' }}>{commit.author}</td>
                <td style={{ padding: '0.5rem' }}>
                  {commit.trailers.session_id ? (
                    <Link
                      to={`/sessions/${commit.trailers.session_id}`}
                      style={{ color: '#3b82f6', textDecoration: 'none', fontFamily: 'monospace', fontSize: '0.8rem' }}
                    >
                      {commit.trailers.session_id}
                    </Link>
                  ) : (
                    <span style={{ color: '#d1d5db' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {commit.trailers.files.length > 0
                    ? commit.trailers.files.join(', ')
                    : <span style={{ color: '#d1d5db' }}>—</span>}
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                  {commit.trailers.entries || <span style={{ color: '#d1d5db' }}>—</span>}
                </td>
                <td style={{ padding: '0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
                  {new Date(commit.date).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
