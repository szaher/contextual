import React from 'react';

interface Props {
  content: string;
}

export function PrContextRenderer({ content }: Props) {
  if (!content) {
    return <p style={{ color: '#6b7280' }}>No PR context available.</p>;
  }

  // Simple markdown rendering (headings, tables, lists, bold, code)
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let inCode = false;
  let codeBlock: string[] = [];

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <table key={`table-${elements.length}`} style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', marginBottom: '1rem' }}>
          <thead>
            <tr>
              {tableRows[0].map((cell, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #e5e7eb' }}>
                  {cell.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.slice(2).map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                    {cell.trim()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      tableRows = [];
    }
    inTable = false;
  };

  const flushCode = () => {
    if (codeBlock.length > 0) {
      elements.push(
        <pre key={`code-${elements.length}`} style={{ background: '#1f2937', color: '#e5e7eb', padding: '1rem', borderRadius: '6px', overflow: 'auto', fontSize: '0.8rem', marginBottom: '1rem' }}>
          {codeBlock.join('\n')}
        </pre>,
      );
      codeBlock = [];
    }
    inCode = false;
  };

  for (const line of lines) {
    // Code blocks
    if (line.startsWith('```')) {
      if (inCode) {
        flushCode();
      } else {
        if (inTable) flushTable();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBlock.push(line);
      continue;
    }

    // Table rows
    if (line.startsWith('|')) {
      if (!inTable) inTable = true;
      const cells = line.split('|').slice(1, -1);
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(<h3 key={`h3-${elements.length}`} style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={`h2-${elements.length}`} style={{ marginTop: '2rem', marginBottom: '0.5rem' }}>{line.slice(3)}</h2>);
    } else if (line.startsWith('- **')) {
      // Bold list item
      const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)$/);
      if (match) {
        elements.push(
          <div key={`li-${elements.length}`} style={{ marginLeft: '1rem', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
            <strong>{match[1]}</strong>{match[2] ? `: ${match[2]}` : ''}
          </div>,
        );
      } else {
        elements.push(<div key={`p-${elements.length}`} style={{ marginLeft: '1rem', fontSize: '0.875rem' }}>{line.slice(2)}</div>);
      }
    } else if (line.startsWith('- ')) {
      elements.push(<div key={`li-${elements.length}`} style={{ marginLeft: '1rem', marginBottom: '0.25rem', fontSize: '0.875rem' }}>{line.slice(2)}</div>);
    } else if (line.startsWith('**') && line.includes('**:')) {
      // Bold key-value
      const match = line.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
      if (match) {
        elements.push(
          <div key={`kv-${elements.length}`} style={{ marginBottom: '0.25rem', fontSize: '0.875rem' }}>
            <strong>{match[1]}</strong>: {match[2]}
          </div>,
        );
      }
    } else if (line.trim()) {
      elements.push(<p key={`p-${elements.length}`} style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>{line}</p>);
    }
  }

  if (inTable) flushTable();
  if (inCode) flushCode();

  return <div>{elements}</div>;
}
