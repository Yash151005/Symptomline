import { useState, useEffect } from 'react';
import { analytics } from '../api';
import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function SymptomDiff() {
  const [symptom, setSymptom] = useState('Headache');
  const [days, setDays] = useState(60);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await analytics.diff(symptom, days);
        setData(res.message ? null : res);
      } catch (err) {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [symptom, days]);

  return (
    <div className="card-static" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={18} color="var(--color-accent)" />
          Symptom Evolution (Diff)
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ width: 150, padding: '6px 12px', fontSize: '0.8125rem', height: 32 }}
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            placeholder="Symptom (e.g. Headache)"
          />
          <select
            className="input"
            style={{ padding: '6px 12px', fontSize: '0.8125rem', height: 32 }}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={30}>Last 30 Days</option>
            <option value={60}>Last 60 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading comparison...</p>
      ) : !data ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Not enough data for "{symptom}" to compare periods.</p>
      ) : (
        <div>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)', marginBottom: 16, fontWeight: 500 }}>
            {data.changes.summary}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: 'var(--color-bg)', padding: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
                First Half (Past)
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Frequency</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{data.earlier.freqPerDay}/day</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Avg Severity</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{data.earlier.avgSeverity}/5</span>
              </div>
            </div>

            <div style={{ background: 'var(--color-bg)', padding: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
                Second Half (Recent)
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Frequency</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                  {data.later.freqPerDay}/day
                  <ChangeBadge change={data.changes.frequency} />
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Avg Severity</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                  {data.later.avgSeverity}/5
                  <ChangeBadge change={data.changes.severity} />
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeBadge({ change }) {
  if (!change) return null;
  const isPos = change.startsWith('+');
  const isZero = change === '+0%' || change === '-0%';
  const color = isZero ? '#9098b1' : isPos ? '#ff6b6b' : '#00b894';
  const Icon = isZero ? Minus : isPos ? TrendingUp : TrendingDown;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: '0.6875rem', fontWeight: 800, color, marginLeft: 8,
      background: `${color}15`, padding: '2px 6px', borderRadius: 10
    }}>
      <Icon size={10} />
      {change.replace('+', '').replace('-', '')}
    </span>
  );
}
