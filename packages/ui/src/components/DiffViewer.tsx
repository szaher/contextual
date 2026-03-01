import React from 'react';

export function DiffViewer({ diff, onApprove, onReject }: { diff: string; onApprove?: () => void; onReject?: () => void }) {
  const lines = diff.split('\n');
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ padding: '0.5rem 0.75rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 500 }}>Diff Preview</span>
        {(onApprove || onReject) && (
          <div>
            {onApprove && <button onClick={onApprove} style={{ padding: '4px 12px', marginRight: 4, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Approve</button>}
            {onReject && <button onClick={onReject} style={{ padding: '4px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Reject</button>}
          </div>
        )}
      </div>
      <pre style={{ padding: '0.75rem', fontSize: '0.8rem', fontFamily: 'monospace', overflow: 'auto', margin: 0, lineHeight: 1.6 }}>
        {lines.map((line, i) => {
          let bg = 'transparent';
          let color = '#111';
          if (line.startsWith('+')) { bg = '#dcfce7'; color = '#166534'; }
          else if (line.startsWith('-')) { bg = '#fee2e2'; color = '#991b1b'; }
          else if (line.startsWith('@@')) { bg = '#dbeafe'; color = '#1e40af'; }
          return <div key={i} style={{ background: bg, color, padding: '0 4px' }}>{line || ' '}</div>;
        })}
      </pre>
    </div>
  );
}
