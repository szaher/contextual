import React, { useEffect, useState } from 'react';
import { TimelineEntry } from '../components/TimelineEntry';

interface HistoryEntry {
  path: string;
  version: number;
  timestamp: string;
  author: string;
  reason: string;
  diff_summary: string;
  checksum: string;
}

export function TimelinePage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPath, setFilterPath] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');

  useEffect(() => {
    fetch('/api/v1/history')
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filtered = entries.filter((e) => {
    if (filterPath && !e.path.includes(filterPath)) return false;
    if (filterAuthor && !e.author.includes(filterAuthor)) return false;
    return true;
  });

  if (loading) return <div>Loading timeline...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

  return (
    <div>
      <h2>Version Timeline</h2>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Filter by path..."
          value={filterPath}
          onChange={(e) => setFilterPath(e.target.value)}
          style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
        />
        <input
          type="text"
          placeholder="Filter by author..."
          value={filterAuthor}
          onChange={(e) => setFilterAuthor(e.target.value)}
          style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
        />
      </div>
      {filtered.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No history entries found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map((entry, i) => (
            <TimelineEntry key={`${entry.path}-${entry.version}-${i}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
