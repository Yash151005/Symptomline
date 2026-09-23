import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { getSymptomFrequency, getSeverityOverTime } from '../data/mockData';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 'var(--radius-sm)',
        background: 'white',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-lg)',
        fontSize: '0.8125rem',
      }}
    >
      <p style={{ fontWeight: 700, marginBottom: 4, color: 'var(--color-text-primary)' }}>
        {label}
      </p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || 'var(--color-text-secondary)' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export function FrequencyChart() {
  const data = getSymptomFrequency();

  return (
    <div className="card-static" style={{ padding: '24px' }}>
      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: 22 }}>
        Symptom Frequency
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef0f5" />
          <XAxis type="number" stroke="#d1d5e0" />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: '#5a6178' }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="count"
            fill="url(#barGradient)"
            radius={[0, 6, 6, 0]}
            barSize={20}
            name="Occurrences"
          />
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6c5ce7" />
              <stop offset="100%" stopColor="#a29bfe" />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SeverityChart() {
  const data = getSeverityOverTime();

  return (
    <div className="card-static" style={{ padding: '24px' }}>
      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: 22 }}>
        Severity Over Time
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="severityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6c5ce7" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#6c5ce7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9098b1' }} interval="preserveStartEnd" stroke="#d1d5e0" />
          <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} stroke="#d1d5e0" />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="severity"
            stroke="#6c5ce7"
            strokeWidth={2.5}
            fill="url(#severityGrad)"
            name="Severity"
            dot={{ r: 4, fill: '#6c5ce7', stroke: 'white', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: '#6c5ce7', stroke: 'white', strokeWidth: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
