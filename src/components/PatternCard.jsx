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

export default function PatternCard({ pattern }) {
  return (
    <div
      className="card"
      style={{
        padding: '22px 24px',
        borderLeft: `4px solid ${confidenceColor(pattern.confidence)}`,
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
              style={{ color: confidenceColor(pattern.confidence) }}
            />
            <span className="tag tag-accent" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
              {pattern.symptom}
            </span>
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
            Based on {pattern.supporting_entries.length} logged entries
          </div>
        </div>

        <ConfidenceRing value={pattern.confidence} />
      </div>
    </div>
  );
}
