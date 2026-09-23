import { useState, useEffect } from 'react';
import TimelineList from '../components/TimelineList';
import CalendarHeatmap from '../components/CalendarHeatmap';
import { FrequencyChart, SeverityChart } from '../components/Charts';
import SymptomDiff from '../components/SymptomDiff';
import PatternCard from '../components/PatternCard';
import EditEntryModal from '../components/EditEntryModal';
import TreatmentsManager from '../components/TreatmentsManager';
import { entries as entriesApi, analytics } from '../api';
import { mockEntries, mockPatterns } from '../data/mockData';
import { List, BarChart3, Brain, Pill } from 'lucide-react';

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
  const [editEntry, setEditEntry] = useState(null);
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [data, pats] = await Promise.all([entriesApi.list(), analytics.patterns()]);
      setEntries(data);
      setPatterns(pats);
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
    } catch (err) {
      console.error('Failed to update:', err);
    }
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
        <CalendarHeatmap />
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
        {activeTab === 'timeline' && <TimelineList entries={entries} onEdit={setEditEntry} />}
        {activeTab === 'charts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SymptomDiff />
            <FrequencyChart />
            <SeverityChart />
          </div>
        )}
        {activeTab === 'patterns' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        <EditEntryModal entry={editEntry} onClose={() => setEditEntry(null)} onSave={handleEditSave} />
      )}
    </div>
  );
}
