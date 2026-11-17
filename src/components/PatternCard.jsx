import { TrendingUp, Info, Zap } from 'lucide-react';

function confidenceColor(confidence) {
  if (confidence >= 80) return '#00b894';
  if (confidence >= 60) return '#e17055';
  return '#9098b1';
}

function ConfidenceRing({ value }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx="26" cy="26" r={radius}
          fill="none"
          stroke="#eef0f5"
          strokeWidth="4"
        />
        <circle
          cx="26" cy="26" r={radius}
          fill="none"
          stroke={confidenceColor(value)}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="confidence-ring"
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 800,
          color: confidenceColor(value),
        }}
      >
        {value}%
      </span>
    </div>
  );
}

const fmt = (n) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));

function OddsBadge({ stats, direction }) {
  const color = direction === 'protective' ? '#0984e3' : '#00b894';
  return (
    <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 86 }} title="Odds ratio with 95% confidence interval">
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color, lineHeight: 1.1 }}>{fmt(stats.odds_ratio)}×</div>
      <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>ODDS RATIO</div>
      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
        95% CI {fmt(stats.ci_low)}–{fmt(stats.ci_high)}
      </div>
    </div>
  );
}

function RiskBars({ stats, label }) {
  const rows = [
    { name: label, value: stats.risk_exposed, color: 'var(--color-accent)' },
    { name: 'Other days', value: stats.risk_unexposed, color: '#b2bec3' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
          <span style={{ width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#eef0f5', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(r.value * 100)}%`, height: '100%', background: r.color, borderRadius: 3 }} />
          </div>
          <span style={{ width: 34, textAlign: 'right' }}>{Math.round(r.value * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function PatternCard({ pattern }) {
  const isStat = pattern.method === 'statistical' && pattern.stats;
  const accent = isStat ? (pattern.direction === 'protective' ? '#0984e3' : '#00b894') : '#b2bec3';
  const triggerLabel = (pattern.trigger || '').replace(/_/g, ' ');

  return (
    <div
      className="card"
      style={{
        padding: '22px 24px',
        borderLeft: `4px solid ${accent}`,
        animation: 'fadeIn 0.4s ease-out both',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <Zap
              size={15}
              style={{ color: accent }}
            />
            <span className="tag tag-accent" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
              {pattern.symptom}
            </span>
            {isStat ? (
              <span className="tag tag-success" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                {pattern.direction === 'protective' ? 'Protective factor' : 'Statistically significant'}
              </span>
            ) : (
              <span className="tag tag-neutral" style={{ fontSize: '0.6875rem' }} title="Not tested against symptom-free days">
                Hypothesis
              </span>
            )}
          </div>

          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--color-text-primary)',
              lineHeight: 1.55,
              marginBottom: 10,
              fontWeight: 500,
            }}
          >
            {pattern.pattern}
          </p>

          {isStat && (
            <RiskBars
              stats={pattern.stats}
              label={`${pattern.lag_days === 1 ? 'Day after' : 'Days with'} ${triggerLabel}`}
            />
          )}

          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
            }}
          >
            <Info size={13} style={{ marginTop: 2, flexShrink: 0, opacity: 0.5 }} />
            {pattern.suggestion}
          </p>

          <div
            style={{
              marginTop: 12,
              fontSize: '0.6875rem',
              color: 'var(--color-text-muted)',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <TrendingUp size={11} />
            {isStat
              ? `${pattern.stats.days_analyzed} days analysed · p = ${pattern.stats.p_value < 0.001 ? '<0.001' : pattern.stats.p_value.toFixed(3)} · FDR q = ${pattern.stats.q_value < 0.001 ? '<0.001' : pattern.stats.q_value.toFixed(3)}`
              : `Based on ${pattern.supporting_entries.length} logged entries`}
          </div>
        </div>

        {isStat ? (
          <OddsBadge stats={pattern.stats} direction={pattern.direction} />
        ) : (
          <ConfidenceRing value={pattern.confidence} />
        )}
      </div>
    </div>
  );
}
