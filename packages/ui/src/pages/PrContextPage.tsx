import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PrContextRenderer } from '../components/PrContextRenderer';

export function PrContextPage() {
  const { id } = useParams<{ id: string }>();
  const [content, setContent] = useState<string>('');
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;

    fetch('/api/v1/pr-context/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_root: '.',
        session_ids: [id],
        format: 'markdown',
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        setContent(data.content || '');
        setStats(data.stats || null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) return <div>Generating PR context...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>PR Context — {id}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={copyToClipboard}
            style={{ padding: '0.25rem 0.75rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      {stats && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          <span>Prompts: {String(stats.total_prompts ?? 0)}</span>
          <span>Tool calls: {String(stats.total_tool_calls ?? 0)}</span>
          <span>Files: {String(stats.files_changed_count ?? 0)}</span>
        </div>
      )}
      <PrContextRenderer content={content} />
    </div>
  );
}
