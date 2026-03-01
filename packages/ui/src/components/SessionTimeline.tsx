import React from 'react';

interface Event {
  id: string;
  request_text: string;
  token_count: number;
  budget: number;
  deep_read: string | null;
  created_at: string;
}

export function SessionTimeline({ events, onSelectEvent }: { events: Event[]; onSelectEvent?: (id: string) => void }) {
  return (
    <div>
      <h3 style={{ marginBottom: '0.75rem' }}>Request Timeline ({events.length})</h3>
      {events.map((e, i) => (
        <div key={e.id} onClick={() => onSelectEvent?.(e.id)} style={{ padding: '0.75rem', marginBottom: '0.5rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, cursor: onSelectEvent ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span style={{ fontWeight: 500 }}>#{i + 1}</span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{new Date(e.created_at).toLocaleTimeString()}</span>
          </div>
          <p style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>{e.request_text}</p>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {e.token_count} / {e.budget} tokens ({Math.round(e.token_count / e.budget * 100)}%)
            {e.deep_read && <span style={{ marginLeft: 8, color: '#d97706' }}>Deep Read</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
