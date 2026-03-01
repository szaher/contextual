import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSession } from '../services/api';
import type { Session } from '../services/api';
import { SessionTimeline } from '../components/SessionTimeline';

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getSession(id)
      .then(setSession)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p style={{ color: '#dc2626' }}>Error: {error}</p>;
  if (!session) return <p>Loading...</p>;

  return (
    <div>
      <Link to="/" style={{ fontSize: '0.875rem', color: '#6b7280' }}>&larr; Back to sessions</Link>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0.75rem 0' }}>Session {session.id}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem', padding: '1rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
        <div><strong>Status:</strong> {session.status}</div>
        <div><strong>Agent:</strong> {session.agent_id || '—'}</div>
        <div><strong>Repo:</strong> {session.repo_path}</div>
        <div><strong>Branch:</strong> {session.branch || '—'}</div>
        <div><strong>Started:</strong> {new Date(session.started_at).toLocaleString()}</div>
        <div><strong>Ended:</strong> {session.ended_at ? new Date(session.ended_at).toLocaleString() : '—'}</div>
      </div>
      <SessionTimeline events={session.events || []} />
    </div>
  );
}
