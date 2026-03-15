import React, { useEffect, useState, useRef } from 'react';
import { ActivityFeed } from '../components/ActivityFeed';

interface ActivityEvent {
  id: string;
  session_id: string;
  event_type: string;
  ctx_path: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Initial fetch
    fetch('/api/v1/activity?limit=100')
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });

    // SSE stream for real-time updates
    const es = new EventSource('/api/v1/activity/stream');
    es.onmessage = (event) => {
      try {
        const newEvent = JSON.parse(event.data) as ActivityEvent;
        setEvents((prev) => [newEvent, ...prev].slice(0, 200));
      } catch { /* skip invalid events */ }
    };
    es.onerror = () => {
      es.close();
    };
    eventSourceRef.current = es;

    return () => {
      es.close();
    };
  }, []);

  const filtered = events.filter((e) => {
    if (filterType && e.event_type !== filterType) return false;
    return true;
  });

  const eventTypes = [...new Set(events.map((e) => e.event_type))];

  if (loading) return <div>Loading activity...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

  return (
    <div>
      <h2>Activity Feed</h2>
      <div style={{ marginBottom: '1rem' }}>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
        >
          <option value="">All events</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      <ActivityFeed events={filtered} />
    </div>
  );
}
