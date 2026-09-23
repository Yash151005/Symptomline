import { useState, useEffect } from 'react';
import {
  FileText, X, Download, Brain, Stethoscope, HeartPulse,
  ChevronRight, MessageCircleQuestion, Pill, BarChart3, Loader2, Activity
} from 'lucide-react';
import {
  mockEntries, mockPatterns, mockDoctorQuestions,
  mockTreatments
} from '../data/mockData';
import { format } from 'date-fns';
import { entries as entriesApi, analytics, treatments as treatmentsApi, reports } from '../api';

const specialties = [
  { id: 'neurologist', label: 'Neurologist', icon: Brain, desc: 'Headaches, migraines, dizziness, brain fog', color: '#6c5ce7', bg: '#f0eeff' },
  { id: 'gastroenterologist', label: 'Gastroenterologist', icon: Stethoscope, desc: 'Stomach, digestion, acid reflux, cramps', color: '#00cec9', bg: '#e6fffe' },
  { id: 'orthopedist', label: 'Orthopedist / PT', icon: Activity, desc: 'Back pain, sciatica, muscle spasms, joints', color: '#e17055', bg: '#fff4f0' },
  { id: 'psychiatrist', label: 'Cardiology / Mental Health', icon: HeartPulse, desc: 'Anxiety, palpitations, insomnia, stress', color: '#e84393', bg: '#fdeef6' },
  { id: 'general', label: 'General / PCP', icon: HeartPulse, desc: 'Overall health, comprehensive timeline', color: '#fd79a8', bg: '#fff0f7' },
];

function ReportPreview({ specialty, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [entries, patterns, treatments, questions] = await Promise.all([
          entriesApi.list(),
          analytics.patterns(),
          treatmentsApi.list(),
          analytics.questions(specialty.id),
        ]);
        setData({ entries, patterns, treatments, questions, useMock: false });
      } catch (err) {
        console.error('API failed, using mock data for report preview');
        setData({
          entries: [...mockEntries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
          patterns: mockPatterns,
          treatments: mockTreatments,
          questions: mockDoctorQuestions[specialty.id] || mockDoctorQuestions.general,
          useMock: true,
        });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [specialty.id]);

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--color-accent)' }} />
        <p style={{ color: 'var(--color-text-muted)' }}>Generating report...</p>
      </div>
    );
  }

  const { entries, patterns, treatments, questions, useMock } = data;

  const specKeywords = {
    neurologist: ['headache', 'migraine', 'dizziness', 'neck', 'brain fog', 'aura'],
    gastroenterologist: ['acid reflux', 'nausea', 'bloat', 'cramp', 'stomach', 'indigestion', 'epigastric'],
    orthopedist: ['back', 'lumbar', 'spasm', 'sciatica', 'spine', 'stiff', 'joint'],
    psychiatrist: ['anxiety', 'palpitation', 'insomnia', 'panic', 'breath', 'stress', 'racing'],
  };

  const keywords = specKeywords[specialty.id];

  let relevantPatterns = patterns;
  if (keywords && patterns.length > 0) {
    const matched = patterns.filter((p) => keywords.some((k) => p.symptom?.toLowerCase().includes(k)));
    if (matched.length > 0) relevantPatterns = matched;
  }

  let relevantEntries = entries;
  if (keywords && entries.length > 0) {
    const matched = entries.filter((e) => keywords.some((k) => e.normalized_symptom?.toLowerCase().includes(k)));
    if (matched.length > 0) relevantEntries = matched;
  }

  const avgSev = relevantEntries.length ? (relevantEntries.reduce((a, b) => a + b.severity, 0) / relevantEntries.length).toFixed(1) : 0;

  // Compute Frequency
  const freqMap = {};
  relevantEntries.forEach((e) => {
    if (!freqMap[e.normalized_symptom]) freqMap[e.normalized_symptom] = { count: 0, totalSev: 0 };
    freqMap[e.normalized_symptom].count++;
    freqMap[e.normalized_symptom].totalSev += e.severity;
  });
  const freq = Object.entries(freqMap).map(([name, d]) => ({
    name, count: d.count, avgSev: (d.totalSev / d.count).toFixed(1)
  })).sort((a, b) => b.count - a.count);

  const handleDownload = async () => {
    if (useMock) {
      alert('PDF export requires the backend to be running.');
      return;
    }
    setDownloading(true);
    try {
      await reports.downloadPdf(specialty.id);
    } catch (err) {
      alert('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ padding: '30px 34px', maxHeight: '80vh', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 26 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                background: specialty.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <specialty.icon size={16} style={{ color: specialty.color }} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Doctor Visit Report
            </h2>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Prepared for <strong style={{ color: specialty.color }}>{specialty.label}</strong> visit • {format(new Date(), 'MMMM d, yyyy')}
          </p>
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ padding: 6 }}>
          <X size={18} />
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 26 }}>
        {[
          { label: 'Total Entries', value: relevantEntries.length, color: '#6c5ce7', bg: '#f0eeff' },
          { label: 'Avg Severity', value: avgSev, color: '#e17055', bg: '#fff4f0' },
          { label: 'Patterns Found', value: relevantPatterns.length, color: '#00b894', bg: '#e6f9f3' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="animate-pop-in"
            style={{
              padding: '16px', borderRadius: 'var(--radius-sm)', background: stat.bg,
              textAlign: 'center', border: `1px solid ${stat.color}15`,
            }}
          >
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Frequency Table */}
      {freq.length > 0 && (
        <Section icon={BarChart3} title="Symptom Frequency" color={specialty.color}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Symptom</th>
                <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600 }}>Count</th>
                <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600 }}>Avg. Severity</th>
              </tr>
            </thead>
            <tbody>
              {freq.map((row) => (
                <tr key={row.name} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span className={`severity-dot severity-${Math.round(parseFloat(row.avgSev))}`} />
                      <span style={{ fontWeight: 500 }}>{row.name}</span>
                    </span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700, color: 'var(--color-accent)' }}>{row.count}</td>
                  <td style={{ padding: '10px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>{row.avgSev}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Patterns */}
      {relevantPatterns.length > 0 && (
        <Section icon={Brain} title="Detected Patterns" color={specialty.color}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {relevantPatterns.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '14px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)',
                  border: '1px solid var(--color-border-subtle)',
                  borderLeft: `4px solid ${p.confidence >= 80 ? '#00b894' : '#e17055'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.8125rem' }}>{p.symptom}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: p.confidence >= 80 ? '#00b894' : '#e17055' }}>
                    {p.confidence}%
                  </span>
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{p.pattern}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Treatments */}
      {treatments.length > 0 && (
        <Section icon={Pill} title="Active Treatments" color={specialty.color}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {treatments.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)',
                  border: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', fontSize: '0.8125rem',
                }}
              >
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                  Since {format(new Date(t.start_date), 'MMM d')}
                  {t.end_date && ` → ${format(new Date(t.end_date), 'MMM d')}`}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Doctor Questions */}
      {questions.length > 0 && (
        <Section icon={MessageCircleQuestion} title="Questions Your Doctor May Ask" color={specialty.color}>
          <div style={{ padding: '16px 18px', background: specialty.bg, borderRadius: 'var(--radius-sm)', border: `1px solid ${specialty.color}12` }}>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {questions.map((q, i) => (
                <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, fontWeight: 500 }}>
                  {q}
                </li>
              ))}
            </ol>
          </div>
        </Section>
      )}

      {/* Download */}
      <button
        className="btn-primary"
        style={{ width: '100%', height: 50, fontSize: '0.9375rem', marginTop: 4 }}
        onClick={handleDownload}
        disabled={downloading}
      >
        {downloading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={18} />}
        {downloading ? 'Generating PDF...' : 'Download as PDF'}
      </button>
      <p style={{ textAlign: 'center', fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 10 }}>
        This report is for informational purposes only. It does not contain medical advice or diagnoses.
      </p>
    </div>
  );
}

function Section({ icon: Icon, title, color, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon size={15} style={{ color }} />
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function ReportGenerator() {
  const [selectedSpecialty, setSelectedSpecialty] = useState(null);

  if (selectedSpecialty) {
    return (
      <div className="modal-overlay" onClick={() => setSelectedSpecialty(null)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <ReportPreview specialty={selectedSpecialty} onClose={() => setSelectedSpecialty(null)} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title" style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
        Generate Report
      </h2>
      <p className="section-subtitle" style={{ fontSize: '0.875rem' }}>
        Choose the type of appointment to tailor the report
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {specialties.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedSpecialty(s)}
              className="card"
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '22px 24px',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                background: 'var(--color-surface)', color: 'var(--color-text-primary)',
                border: '1.5px solid var(--color-border)', fontFamily: 'var(--font-sans)',
                animation: `fadeIn 0.4s ease-out ${i * 100}ms both`,
              }}
            >
              <div
                style={{
                  width: 48, height: 48, borderRadius: 'var(--radius-md)',
                  background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'transform var(--transition-normal)',
                }}
              >
                <Icon size={22} style={{ color: s.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{s.desc}</div>
              </div>
              <ChevronRight size={20} style={{ color: 'var(--color-text-muted)', transition: 'transform var(--transition-fast)' }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
