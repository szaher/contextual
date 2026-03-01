import React from 'react';
import { Link } from 'react-router-dom';

interface Session {
  id: string;
  agent_id: string | null;
  status: string;
  request_count: number;
  started_at: string;
  repo_path: string;
}

export function SessionList({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) {
    return <p style={{ color: '#6b7280', padding: '2rem 0' }}>No sessions found.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Agent</th>
          <th>Status</th>
          <th>Requests</th>
          <th>Started</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <tr key={s.id}>
            <td><Link to={`/sessions/${s.id}`}>{s.id}</Link></td>
            <td>{s.agent_id || '—'}</td>
            <td><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', background: s.status === 'active' ? '#dcfce7' : '#f3f4f6', color: s.status === 'active' ? '#166534' : '#374151' }}>{s.status}</span></td>
            <td>{s.request_count}</td>
            <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>{new Date(s.started_at).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
