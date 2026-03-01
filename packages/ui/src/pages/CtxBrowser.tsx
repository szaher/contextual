import React, { useEffect, useState } from 'react';
import { listProposals } from '../services/api';
import type { Proposal } from '../services/api';
import { DiffViewer } from '../components/DiffViewer';

export function CtxBrowser() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    listProposals()
      .then((data) => setProposals(data.proposals))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>Memory Browser</h1>
      {error && <p style={{ color: '#dc2626', marginBottom: '1rem' }}>Error: {error}</p>}
      <h2 style={{ fontSize: '1.125rem', fontWeight: 500, marginBottom: '0.75rem' }}>Pending Proposals ({proposals.filter(p => p.status === 'proposed').length})</h2>
      {proposals.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No proposals found. Connect to the daemon to see .ctx update proposals.</p>
      ) : (
        proposals.map((p) => (
          <div key={p.id} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{p.ctx_path}</span>
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', background: p.status === 'proposed' ? '#fef3c7' : p.status === 'approved' ? '#dcfce7' : '#f3f4f6' }}>{p.status}</span>
            </div>
            {p.diff_content && <DiffViewer diff={p.diff_content} />}
          </div>
        ))
      )}
    </div>
  );
}
