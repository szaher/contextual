import React, { useEffect, useState } from 'react';
import { SessionList } from '../components/SessionList';
import { listSessions, getHealth } from '../services/api';
import type { Session, HealthStatus } from '../services/api';

export function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listSessions({ limit: 20 })
      .then((data) => setSessions(data.sessions))
      .catch((err) => setError(err.message));
    getHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Dashboard</h1>
        {health && (
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Daemon: {health.status} | Uptime: {Math.round(health.uptime_seconds / 60)}m
          </div>
        )}
      </div>
      {error && <p style={{ color: '#dc2626', marginBottom: '1rem' }}>Error: {error}</p>}
      <h2 style={{ fontSize: '1.125rem', fontWeight: 500, marginBottom: '0.75rem' }}>Recent Sessions</h2>
      <SessionList sessions={sessions} />
    </div>
  );
}
