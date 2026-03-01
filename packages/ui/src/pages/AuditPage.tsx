import React, { useEffect, useState } from 'react';
import { queryAudit } from '../services/api';
import type { AuditEntry } from '../services/api';
import { AuditLog } from '../components/AuditLog';
import { SearchBar } from '../components/SearchBar';

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [ctxPath, setCtxPath] = useState('');
  const [error, setError] = useState('');

  const load = (path?: string) => {
    queryAudit({ ctx_path: path || undefined, limit: 50 })
      .then((data) => { setEntries(data.entries); setTotal(data.total); })
      .catch((err) => setError(err.message));
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>Audit Log</h1>
      {error && <p style={{ color: '#dc2626', marginBottom: '1rem' }}>Error: {error}</p>}
      <SearchBar onSearch={(q) => { setCtxPath(q); load(q); }} placeholder="Filter by .ctx path..." />
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
        Showing {entries.length} of {total} entries
        {ctxPath && <span> for <code>{ctxPath}</code></span>}
      </p>
      <AuditLog entries={entries} />
    </div>
  );
}
