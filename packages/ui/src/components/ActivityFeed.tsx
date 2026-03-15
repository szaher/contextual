import React, { useState } from 'react';

interface ActivityEvent {
  id: string;
  session_id: string;
  event_type: string;
  ctx_path: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

const EVENT_ICONS: Record<string, string> = {
  CONTEXT_INJECTED: 'C',
  FILE_MODIFIED: 'F',
  PROPOSAL_CREATED: 'P',
  PROPOSAL_APPLIED: 'A',
  SESSION_START: 'S',
  SESSION_END: 'E',
  CONFLICT_DETECTED: '!',
  CONFLICT_RESOLVED: 'R',
};

const EVENT_COLORS: Record<string, string> = {
  CONTEXT_INJECTED: '#3b82f6',
  FILE_MODIFIED: '#f59e0b',
  PROPOSAL_CREATED: '#8b5cf6',
  PROPOSAL_APPLIED: '#22c55e',
  SESSION_START: '#6b7280',
  SESSION_END: '#6b7280',
  CONFLICT_DETECTED: '#ef4444',
  CONFLICT_RESOLVED: '#22c55e',
};

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) {
    return <p style={{ color: '#6b7280' }}>No activity events.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {events.map((event) => {
        const icon = EVENT_ICONS[event.event_type] || '?';
        const color = EVENT_COLORS[event.event_type] || '#6b7280';
        const dateStr = new Date(event.created_at).toLocaleString();

        return (
          <div
            key={event.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              padding: '0.5rem',
              borderBottom: '1px solid #f3f4f6',
              cursor: 'pointer',
            }}
            onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: color,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{event.event_type}</span>
                <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{dateStr}</span>
              </div>
              {event.ctx_path && (
                <div style={{ fontSize: '0.8rem', color: '#6b7280', fontFamily: 'monospace' }}>
                  {event.ctx_path}
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                Session: {event.session_id}
              </div>
              {expandedId === event.id && Object.keys(event.data).length > 0 && (
                <pre style={{ marginTop: '0.25rem', fontSize: '0.75rem', background: '#f9fafb', padding: '0.5rem', borderRadius: '4px', overflow: 'auto' }}>
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
