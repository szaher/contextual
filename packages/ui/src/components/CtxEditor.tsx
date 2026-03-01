import React, { useState } from 'react';

export function CtxEditor({ content, onSave }: { content: string; onSave?: (newContent: string) => void }) {
  const [value, setValue] = useState(content);
  const [editing, setEditing] = useState(false);

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
        <span style={{ fontWeight: 500 }}>.ctx Editor</span>
        <div>
          {editing ? (
            <>
              <button onClick={() => { onSave?.(value); setEditing(false); }} style={{ padding: '4px 12px', marginRight: 4, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Save</button>
              <button onClick={() => { setValue(content); setEditing(false); }} style={{ padding: '4px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={{ padding: '4px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}>Edit</button>
          )}
        </div>
      </div>
      <textarea value={value} onChange={(e) => setValue(e.target.value)} readOnly={!editing} style={{ width: '100%', minHeight: 400, padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.875rem', border: 'none', resize: 'vertical', background: editing ? '#fff' : '#f9fafb' }} />
    </div>
  );
}
