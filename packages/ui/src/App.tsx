import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { SessionDetail } from './pages/SessionDetail';
import { CtxBrowser } from './pages/CtxBrowser';
import { AuditPage } from './pages/AuditPage';
import { TimelinePage } from './pages/TimelinePage';
import { ContextMapPage } from './pages/ContextMapPage';
import { ConflictsPage } from './pages/ConflictsPage';
import { ActivityPage } from './pages/ActivityPage';
import { PrContextPage } from './pages/PrContextPage';

export function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: '1rem' }}>
      <nav style={{ display: 'flex', gap: '1rem', padding: '1rem 0', borderBottom: '1px solid #e5e7eb', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <Link to="/" style={{ fontWeight: 'bold', textDecoration: 'none', color: '#111' }}>ctxl</Link>
        <Link to="/" style={{ textDecoration: 'none', color: '#6b7280' }}>Sessions</Link>
        <Link to="/ctx" style={{ textDecoration: 'none', color: '#6b7280' }}>Memory</Link>
        <Link to="/audit" style={{ textDecoration: 'none', color: '#6b7280' }}>Audit</Link>
        <Link to="/timeline" style={{ textDecoration: 'none', color: '#6b7280' }}>Timeline</Link>
        <Link to="/map" style={{ textDecoration: 'none', color: '#6b7280' }}>Map</Link>
        <Link to="/conflicts" style={{ textDecoration: 'none', color: '#6b7280' }}>Conflicts</Link>
        <Link to="/activity" style={{ textDecoration: 'none', color: '#6b7280' }}>Activity</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/sessions/:id/pr" element={<PrContextPage />} />
        <Route path="/ctx" element={<CtxBrowser />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/map" element={<ContextMapPage />} />
        <Route path="/conflicts" element={<ConflictsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
      </Routes>
    </div>
  );
}
