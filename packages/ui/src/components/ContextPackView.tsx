import React from 'react';

interface PackItem {
  content: string;
  source: string;
  section: string;
  entry_id: string;
  score: number;
  tokens: number;
  reason_codes: string[];
  staleness: { verified_at: string; is_stale: boolean };
}

interface OmittedItem {
  content_preview: string;
  source: string;
  section: string;
  score: number;
  tokens: number;
  reason: string;
}

export function ContextPackView({ items, omitted, totalTokens, budget }: { items: PackItem[]; omitted: OmittedItem[]; totalTokens: number; budget: number }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: 6, flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: '#1e40af' }}>Tokens</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{totalTokens} / {budget}</div>
        </div>
        <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: 6, flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: '#166534' }}>Included</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{items.length}</div>
        </div>
        <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: 6, flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>Omitted</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{omitted.length}</div>
        </div>
      </div>
      <h4 style={{ marginBottom: '0.5rem' }}>Included Items</h4>
      <table>
        <thead><tr><th>Source</th><th>Section</th><th>Entry</th><th>Score</th><th>Tokens</th><th>Reasons</th></tr></thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td style={{ fontSize: '0.875rem' }}>{item.source}</td>
              <td>{item.section}</td>
              <td>{item.entry_id}</td>
              <td>{item.score.toFixed(2)}</td>
              <td>{item.tokens}</td>
              <td>{item.reason_codes.map((r) => <span key={r} style={{ display: 'inline-block', padding: '1px 6px', margin: '1px', borderRadius: 3, fontSize: '0.7rem', background: '#dbeafe', color: '#1e40af' }}>{r}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {omitted.length > 0 && (
        <>
          <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Omitted Items</h4>
          <table>
            <thead><tr><th>Source</th><th>Section</th><th>Score</th><th>Reason</th></tr></thead>
            <tbody>
              {omitted.map((item, i) => (
                <tr key={i} style={{ color: '#9ca3af' }}>
                  <td>{item.source}</td>
                  <td>{item.section}</td>
                  <td>{item.score.toFixed(2)}</td>
                  <td>{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
