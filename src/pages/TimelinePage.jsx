import { useState, useEffect } from 'react';
import TimelineList from '../components/TimelineList';
import CalendarHeatmap from '../components/CalendarHeatmap';
import { FrequencyChart, SeverityChart } from '../components/Charts';
import SymptomDiff from '../components/SymptomDiff';
import PatternCard from '../components/PatternCard';
import EditEntryModal from '../components/EditEntryModal';
import TreatmentsManager from '../components/TreatmentsManager';
import RedFlagAlert from '../components/RedFlagAlert';
import { entries as entriesApi, analytics } from '../api';
import { mockEntries, mockPatterns } from '../data/mockData';
import { List, BarChart3, Brain, Pill, Search, Download, SlidersHorizontal, ClipboardCheck } from 'lucide-react';

const tabs = [
  { id: 'timeline', label: 'Timeline', icon: List },
  { id: 'charts', label: 'Charts', icon: BarChart3 },
  { id: 'patterns', label: 'Patterns', icon: Brain },
  { id: 'treatments', label: 'Treatments', icon: Pill },
];

export default function TimelinePage() {
  const [activeTab, setActiveTab] = useState('timeline');
  const [entries, setEntries] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [triggerStatus, setTriggerStatus] = useState(null);
  const [editEntry, setEditEntry] = useState(null);
  const [alertEntry, setAlertEntry] = useState(null);
  const [useMock, setUseMock] = useState(false);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [range, setRange] = useState('all');
  const [sort, setSort] = useState('newest');
  const [now] = useState(() => Date.now());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [data, pats] = await Promise.all([entriesApi.list(), analytics.patterns()]);
      setEntries(data);
      setPatterns(pats);
      analytics.triggers().then(setTriggerStatus).catch(() => {});
    } catch {
      setUseMock(true);
      setEntries([...mockEntries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      setPatterns(mockPatterns);
    }
  }

  const handleEditSave = async (id, updates) => {
    if (useMock) {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
      setEditEntry(null);
      return;
    }
    try {
      const updated = await entriesApi.update(id, updates);
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
      setEditEntry(null);
      if (updated.red_flags?.length && !updated.red_flag_acknowledged_at) setAlertEntry(updated);
    } catch (err) {
      console.error('Failed to update:', err);
    }
  };

  const handleDelete = async (id) => {
    if (useMock) {
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      setEditEntry(null);
      return;
    }
    try {
      await entriesApi.delete(id);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      setEditEntry(null);
    } catch (err) {
      console.error('Failed to delete entry:', err);
      throw err;
    }
  };

  const filteredEntries = entries
    .filter((entry) => {
      const haystack = [
        entry.raw_text,
        entry.normalized_symptom,
        entry.body_location,
        ...(entry.context_tags || []),
      ].join(' ').toLowerCase();
      const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
      const matchesSeverity = severity === 'all' || entry.severity === Number(severity);
      const age = (now - new Date(entry.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      const matchesRange = range === 'all' || age <= Number(range);
      return matchesSearch && matchesSeverity && matchesRange;
    })
    .sort((a, b) => {
      if (sort === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
      if (sort === 'severity') return b.severity - a.severity || new Date(b.timestamp) - new Date(a.timestamp);
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

  const recentEntries = entries.filter((entry) => now - new Date(entry.timestamp).getTime() <= 14 * 24 * 60 * 60 * 1000);
  const recentDays = new Set(recentEntries.map((entry) => new Date(entry.timestamp).toISOString().slice(0, 10))).size;
  const contextualEntries = recentEntries.filter((entry) => entry.body_location || (entry.context_tags || []).length > 0).length;
  const readiness = Math.min(100, Math.round(
    (Math.min(recentDays / 7, 1) * 40)
    + (Math.min(recentEntries.length / 7, 1) * 30)
    + (recentEntries.length ? (contextualEntries / recentEntries.length) * 30 : 0)
  ));
  const readinessTips = [];
  if (recentDays < 7) readinessTips.push(`Log on ${7 - recentDays} more day${7 - recentDays === 1 ? '' : 's'} to show a clearer recent pattern.`);
  if (recentEntries.length > 0 && contextualEntries < recentEntries.length) readinessTips.push('Add locations or context tags when you can.');
  if (recentEntries.length === 0) readinessTips.push('Start with a short description of how you feel today.');

  const exportCsv = () => {
    const headers = ['Date', 'Symptom', 'Severity', 'Body location', 'Context tags', 'Description'];
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = filteredEntries.map((entry) => [
      new Date(entry.timestamp).toISOString(),
      entry.normalized_symptom,
      entry.severity,
      entry.body_location,
      (entry.context_tags || []).join('; '),
      entry.raw_text,
    ].map(escape).join(','));
    const blob = new Blob([[headers.map(escape).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `noted-timeline-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-container" style={{ paddingTop: 36, paddingBottom: 100, position: 'relative' }}>
      <div className="orb orb-blue" style={{ width: 250, height: 250, top: -60, left: -80 }} />

      <h1
        className="animate-fade-in"
        style={{
          fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 24,
          background: 'var(--gradient-cool)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}
      >
        Your Timeline
      </h1>

      <div style={{ marginBottom: 24 }} className="animate-fade-in">
        <CalendarHeatmap entries={entries} />
      </div>

      <div className="card-static" style={{ padding: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <SlidersHorizontal size={16} color="var(--color-accent)" />
          <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>Find entries</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {filteredEntries.length} of {entries.length}
          </span>
          <button className="btn-secondary" onClick={exportCsv} disabled={!filteredEntries.length} style={{ height: 32, padding: '0 10px', fontSize: '0.75rem' }}>
            <Download size={13} /> Export CSV
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) repeat(3, 1fr)', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--color-text-muted)' }} />
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symptoms, notes, tags..." style={{ height: 34, paddingLeft: 32, fontSize: '0.75rem' }} />
          </div>
          <select className="input" value={range} onChange={(e) => setRange(e.target.value)} style={{ height: 34, padding: '0 8px', fontSize: '0.75rem' }}>
            <option value="all">Any date</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ height: 34, padding: '0 8px', fontSize: '0.75rem' }}>
            <option value="all">Any severity</option>
            {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Severity {level}</option>)}
          </select>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} style={{ height: 34, padding: '0 8px', fontSize: '0.75rem' }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="severity">Highest severity</option>
          </select>
        </div>
      </div>

      <div className="card-static" style={{ padding: 18, marginBottom: 24, border: '1px solid rgba(108, 92, 231, 0.14)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--color-accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ClipboardCheck size={17} color="var(--color-accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 800 }}>Tracking readiness</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>A data-completeness guide for your next visit — not a health score.</p>
              </div>
              <strong style={{ color: 'var(--color-accent)', fontSize: '1.1rem' }}>{readiness}%</strong>
            </div>
            <div style={{ height: 7, background: 'var(--color-border-subtle)', borderRadius: 8, overflow: 'hidden', margin: '12px 0 8px' }}>
              <div style={{ width: `${readiness}%`, height: '100%', background: 'var(--gradient-primary)', borderRadius: 8, transition: 'width 300ms ease' }} />
            </div>
            {readinessTips.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                {readinessTips.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            ) : (
              <p style={{ color: 'var(--color-success)', fontSize: '0.75rem', fontWeight: 700 }}>Great coverage across the last 14 days.</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, padding: 4, background: '#f0f2f7', borderRadius: 'var(--radius-full)' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 'var(--radius-full)', border: 'none',
                background: isActive ? 'var(--gradient-primary)' : 'transparent',
                color: isActive ? 'white' : 'var(--color-text-muted)',
                boxShadow: isActive ? 'var(--shadow-accent)' : 'none',
                fontSize: '0.8125rem', fontWeight: 700, fontFamily: 'var(--font-sans)',
                cursor: 'pointer', transition: 'all var(--transition-normal)',
              }}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="animate-fade-in" key={activeTab}>
        {activeTab === 'timeline' && (
          filteredEntries.length ? <TimelineList entries={filteredEntries} onEdit={setEditEntry} /> : (
            <div className="card-static" style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No entries match these filters.
            </div>
          )
        )}
        {activeTab === 'charts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SymptomDiff entries={filteredEntries} />
            <FrequencyChart entries={filteredEntries} />
            <SeverityChart entries={filteredEntries} />
          </div>
        )}
        {activeTab === 'patterns' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {triggerStatus && (
              <div className="card-static" style={{ padding: '14px 18px', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                {triggerStatus.ready ? (
                  <>
                    <strong style={{ color: 'var(--color-success)' }}>Statistical trigger analysis active.</strong>{' '}
                    Compared {triggerStatus.observedDays} checked-in days across {triggerStatus.testsRun} symptom–factor tests
                    (same day and next day). {triggerStatus.findingCount} association{triggerStatus.findingCount === 1 ? '' : 's'} survived
                    false-discovery-rate correction.
                  </>
                ) : (
                  <>
                    <strong>Trigger analysis needs {triggerStatus.minDays} daily check-ins</strong> ({triggerStatus.observedDays} so far).
                    Until then, patterns below are descriptive only: they show what you mentioned, not what actually raises your risk.
                  </>
                )}
              </div>
            )}
            {patterns.length === 0 ? (
              <div className="card-static" style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <Brain size={36} style={{ marginBottom: 14, opacity: 0.3, color: 'var(--color-accent)' }} />
                <p style={{ fontWeight: 600 }}>Not enough data yet.</p>
                <p style={{ fontSize: '0.8125rem', marginTop: 4 }}>Keep logging to discover patterns.</p>
              </div>
            ) : (
              patterns.map((p, i) => (
                <div key={p.id} style={{ animation: `fadeIn 0.4s ease-out ${i * 80}ms both` }}>
                  <PatternCard pattern={p} />
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'treatments' && <TreatmentsManager />}
      </div>

      {editEntry && (
        <EditEntryModal entry={editEntry} onClose={() => setEditEntry(null)} onSave={handleEditSave} onDelete={handleDelete} />
      )}

      {alertEntry && (
        <RedFlagAlert
          flags={alertEntry.red_flags}
          onAcknowledge={async () => {
            try {
              const { entry } = await entriesApi.acknowledgeFlags(alertEntry.id);
              setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
            } catch (err) {
              console.error('Failed to record acknowledgement:', err);
            }
            setAlertEntry(null);
          }}
        />
      )}
    </div>
  );
}
