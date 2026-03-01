import React, { useState } from 'react';

export function SearchBar({ onSearch, placeholder }: { onSearch: (query: string) => void; placeholder?: string }) {
  const [query, setQuery] = useState('');
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSearch(query)}
        placeholder={placeholder || 'Search...'}
        style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.875rem' }}
      />
      <button onClick={() => onSearch(query)} style={{ padding: '0.5rem 1rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Search</button>
    </div>
  );
}
