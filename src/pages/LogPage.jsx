import { useState, useEffect } from 'react';
import QuickEntry from '../components/QuickEntry';
import TimelineList from '../components/TimelineList';
import EditEntryModal from '../components/EditEntryModal';
import { entries as entriesApi, analytics } from '../api';
import { mockEntries } from '../data/mockData';
import { format } from 'date-fns';
import { Activity, TrendingUp, Zap, Calendar } from 'lucide-react';

export default function LogPage() {
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState({ today: 0, week: 0, avgSeverity: 0, patternCount: 0 });
  const [editEntry, setEditEntry] = useState(null);
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [data, statsData] = await Promise.all([entriesApi.list(), analytics.stats()]);
      setEntries(data);
      setStats(statsData);
    } catch {
      // Fallback to mock data if backend is not running
      setUseMock(true);
      const sorted = [...mockEntries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setEntries(sorted);
      setStats({ today: 2, week: 8, avgSeverity: 3.1, patternCount: 4 });
    }
  }

  const handleNewEntry = async (rawText) => {
    if (useMock) {
      const newEntry = {
        id: `new-${Date.now()}`,
        profile_id: '1',
        timestamp: new Date().toISOString(),
        raw_text: rawText,
        normalized_symptom: 'General discomfort',
        severity: 2,
        body_location: 'General',
        context_tags: [format(new Date(), 'EEEE').toLowerCase(), new Date().getHours() < 12 ? 'morning' : 'afternoon'],
        source: 'text',
      };
      setEntries((prev) => [newEntry, ...prev]);
      return;
    }

    try {
      const entry = await entriesApi.create(rawText);
      setEntries((prev) => [entry, ...prev]);
      const statsData = await analytics.stats();
      setStats(statsData);
    } catch (err) {
      console.error('Failed to create entry:', err);
    }
  };

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
      console.error('Failed to update entry:', err);
    }
  };

  const statCards = [
    { label: 'Logged Today', value: stats.today, icon: Activity, color: '#6c5ce7', bg: 'linear-gradient(135deg, #f0eeff, #e8e4ff)', iconBg: '#6c5ce7' },
    { label: 'This Week', value: stats.week, icon: Calendar, color: '#00cec9', bg: 'linear-gradient(135deg, #e6fffe, #d4fffe)', iconBg: '#00cec9' },
    { label: 'Avg Severity', value: stats.avgSeverity || '—', icon: TrendingUp, color: '#e17055', bg: 'linear-gradient(135deg, #fff4f0, #ffe8e0)', iconBg: '#e17055' },
    { label: 'Patterns', value: stats.patternCount, icon: Zap, color: '#00b894', bg: 'linear-gradient(135deg, #e6f9f3, #d4f5eb)', iconBg: '#00b894' },
  ];

  return (
    <div className="page-container" style={{ paddingTop: 36, paddingBottom: 100, position: 'relative' }}>
      <div className="orb orb-purple" style={{ width: 300, height: 300, top: -100, right: -100 }} />
      <div className="orb orb-pink" style={{ width: 200, height: 200, bottom: 200, left: -80 }} />

      {/* Greeting */}
      <div className="animate-fade-in" style={{ marginBottom: 32, position: 'relative' }}>
        <h1
          style={{
            fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6,
            background: 'var(--gradient-hero)', backgroundSize: '300% 300%',
            animation: 'gradient-shift 6s ease infinite',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}
        >
          How are you feeling?
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', fontWeight: 500 }}>
          Log anything in your own words — we'll structure it for you ✨
        </p>
      </div>

      <QuickEntry onSubmit={handleNewEntry} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32, marginTop: 20 }}>
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="stat-card"
              style={{ background: stat.bg, borderRadius: 'var(--radius-md)', animation: `fadeIn 0.4s ease-out ${i * 80}ms both` }}
            >
              <div
                style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: stat.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 4px 12px ${stat.color}30`,
                }}
              >
                <Icon size={18} color="white" />
              </div>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="section-title">Recent Entries</h2>
      <TimelineList entries={entries.slice(0, 10)} onEdit={setEditEntry} />

      {editEntry && (
        <EditEntryModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSave={handleEditSave}
        />
      )}

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: repeat(4"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
