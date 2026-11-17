import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, Download, AlertTriangle, Lock, Pill, MessageCircleQuestion, Brain, BarChart3, ListOrdered } from 'lucide-react';
import { shared } from '../api';
import IntegrityBadge from '../components/IntegrityBadge';

const SPECIALTY_LABEL = {
  neurologist: 'Neurology', gastroenterologist: 'Gastroenterology', orthopedist: 'Orthopedics / PT',
  psychiatrist: 'Cardiology / Mental Health', general: 'General Practice',
};
const ACCENT = '#6c5ce7';

function Card({ icon: Icon, title, children, right }) {
  return (
    <section className="card-static" style={{ padding: 20, marginBottom: 16 }}>
      <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={16} style={{ color: ACCENT }} /> {title}
        {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
      </h2>
      {children}
    </section>
  );
}

function WeeklyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const w = payload[0].payload;
  return (
    <div style={{ padding: '8px 12px', background: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', fontSize: '0.75rem' }}>
      <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>Week of {format(new Date(`${w.week_start}T00:00:00`), 'MMM d')}</div>
      <div style={{ color: 'var(--color-text-secondary)' }}>{w.count} entries · mean severity {w.avg_severity.toFixed(1)}/5</div>
    </div>
  );
}

const th = { textAlign: 'left', padding: '8px 10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' };
const td = { padding: '8px 10px', borderTop: '1px solid var(--color-border-subtle)', fontSize: '0.8125rem' };

/** Read-only clinician view, reached via a patient-issued share link. No login. */
export default function SharedReportPage({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    shared.get(token).then(setData).catch((e) => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <div className="page-container" style={{ paddingTop: 80, textAlign: 'center', maxWidth: 520 }}>
        <Lock size={36} style={{ color: 'var(--color-text-muted)', marginBottom: 14 }} />
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 8 }}>This link is not available</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{error}. Ask the patient to send a new one.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: ACCENT }} />
      </div>
    );
  }

  const weekly = data.weekly.map((w) => ({ ...w, label: format(new Date(`${w.week_start}T00:00:00`), 'MMM d') }));

  return (
    <div className="page-container" style={{ paddingTop: 28, paddingBottom: 60, maxWidth: 920 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.08em', color: ACCENT }}>NOTED. · SHARED CLINICAL SUMMARY</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{data.patient.name}</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            {SPECIALTY_LABEL[data.specialty] || data.specialty} · last {data.window_days} days · link expires {format(new Date(data.link_expires_at), 'MMM d, h:mm a')}
          </p>
        </div>
        <a className="btn-primary" href={shared.pdfUrl(token)} style={{ textDecoration: 'none' }}>
          <Download size={16} /> Download PDF
        </a>
      </header>

      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        Patient-generated health data. Symptoms are self-reported and normalised automatically; severity is the patient's 1–5 rating.
        This view is read-only. The patient can see when it was opened and can revoke it at any time.
      </p>

      <div style={{ marginBottom: 16 }}>
        <IntegrityBadge integrity={data.integrity} timeliness={data.timeliness} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          ['Entries', data.totals.entries],
          ['Days with symptoms', `${data.totals.symptom_days} / ${data.window_days}`],
          ['Mean severity', `${data.totals.avg_severity} / 5`],
          ['Safety alerts', data.safety_alerts.length],
        ].map(([label, value]) => (
          <div key={label} className="card-static" style={{ padding: 16 }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{value}</div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      {data.safety_alerts.length > 0 && (
        <Card icon={AlertTriangle} title={`Safety alerts raised (${data.safety_alerts.length})`}>
          {data.safety_alerts.map((e) => (
            <div key={e.id} style={{ padding: '8px 12px', marginBottom: 6, borderRadius: 'var(--radius-sm)', background: '#fff5f5', border: '1px solid #f5c6cb', fontSize: '0.8125rem' }}>
              <strong style={{ color: '#c0392b' }}>{e.red_flags[0]?.level.toUpperCase()}: {e.red_flags[0]?.title}</strong>
              <span style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>{format(new Date(e.timestamp), 'MMM d, h:mm a')}</span>
              {e.raw_text && <div style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)', marginTop: 2 }}>"{e.raw_text}"</div>}
            </div>
          ))}
        </Card>
      )}

      {weekly.length > 0 && (
        <Card icon={BarChart3} title="Entries per week">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#eef0f5" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5a6178' }} axisLine={{ stroke: '#d1d5e0' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5a6178' }} axisLine={false} tickLine={false} />
              <Tooltip content={<WeeklyTooltip />} cursor={{ fill: '#f0eeff' }} />
              <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Show as table</summary>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
              <thead><tr><th style={th}>Week of</th><th style={th}>Entries</th><th style={th}>Mean severity</th></tr></thead>
              <tbody>
                {weekly.map((w) => (
                  <tr key={w.week_start}><td style={td}>{w.label}</td><td style={td}>{w.count}</td><td style={td}>{w.avg_severity.toFixed(1)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>
      )}

      <Card icon={ListOrdered} title="Symptom frequency">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Symptom</th><th style={th}>Occurrences</th><th style={th}>Mean severity</th></tr></thead>
          <tbody>
            {data.frequency.map((f) => (
              <tr key={f.symptom}><td style={{ ...td, fontWeight: 600 }}>{f.symptom}</td><td style={td}>{f.count}</td><td style={td}>{f.avg_severity.toFixed(1)} / 5</td></tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data.patterns.length > 0 && (
        <Card icon={Brain} title="Patterns">
          {data.patterns.map((p, i) => (
            <div key={i} style={{ padding: '10px 12px', marginBottom: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', borderLeft: `4px solid ${p.method === 'statistical' ? '#00b894' : '#b2bec3'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.8125rem' }}>
                <strong>{p.symptom}</strong>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                  {p.stats ? `OR ${p.stats.odds_ratio.toFixed(1)} · 95% CI ${p.stats.ci_low.toFixed(1)}–${p.stats.ci_high.toFixed(1)} · q=${p.stats.q_value.toFixed(3)}` : 'Descriptive hypothesis, not tested'}
                </span>
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{p.pattern}</div>
            </div>
          ))}
        </Card>
      )}

      {data.treatments.length > 0 && (
        <Card icon={Pill} title="Treatments">
          {data.treatments.map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.8125rem', padding: '6px 0', borderTop: i ? '1px solid var(--color-border-subtle)' : 'none' }}>
              <span><strong>{t.name}</strong>{t.notes && <span style={{ color: 'var(--color-text-muted)' }}> · {t.notes}</span>}</span>
              <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                {format(new Date(t.start_date), 'MMM d, yyyy')} → {t.end_date ? format(new Date(t.end_date), 'MMM d, yyyy') : 'ongoing'}
              </span>
            </div>
          ))}
        </Card>
      )}

      {data.questions.length > 0 && (
        <Card icon={MessageCircleQuestion} title="Questions the patient has prepared for">
          <ol style={{ paddingLeft: 18, fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            {data.questions.map((q, i) => <li key={i}>{q}</li>)}
          </ol>
        </Card>
      )}

      <Card icon={ListOrdered} title={`Entries (${Math.min(100, data.totals.entries)} most recent)`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>When</th><th style={th}>Symptom</th><th style={th}>Sev.</th><th style={th}>Location</th>
                <th style={th}>{data.include_raw_text ? "Patient's words" : 'Context'}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{format(new Date(e.timestamp), 'MMM d, h:mm a')}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{e.symptom}{e.edited && <span title="Edited by the patient after logging; full history is in the audit ledger" style={{ fontSize: '0.625rem', color: '#b7791f', marginLeft: 4 }}>edited</span>}</td>
                  <td style={td}>{e.severity}</td>
                  <td style={{ ...td, color: 'var(--color-text-secondary)' }}>{e.body_location || '—'}</td>
                  <td style={{ ...td, color: 'var(--color-text-secondary)', fontStyle: e.raw_text ? 'italic' : 'normal' }}>
                    {e.raw_text ?? (e.context_tags.join(', ') || '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
