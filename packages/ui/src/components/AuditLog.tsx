import React from 'react';

interface AuditEntry {
  id: string;
  ctx_path: string;
  change_type: string;
  initiated_by: string;
  reason: string;
  created_at: string;
}

export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p style={{ color: '#6b7280', padding: '2rem 0' }}>No audit entries found.</p>;
  }
  return (
    <table>
      <thead>
        <tr><th>Date</th><th>Path</th><th>Type</th><th>By</th><th>Reason</th></tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>{new Date(e.created_at).toLocaleString()}</td>
            <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{e.ctx_path}</td>
            <td><span style={{ padding: '1px 6px', borderRadius: 3, fontSize: '0.75rem', background: '#f3f4f6' }}>{e.change_type}</span></td>
            <td style={{ fontSize: '0.875rem' }}>{e.initiated_by}</td>
            <td style={{ fontSize: '0.875rem' }}>{e.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
