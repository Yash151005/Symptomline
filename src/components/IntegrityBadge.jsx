import { ShieldCheck, ShieldAlert, ShieldQuestion, Clock } from 'lucide-react';

const STATES = {
  verified: {
    icon: ShieldCheck, color: '#00a37a', bg: '#e6f9f3', border: '#b8ebd9', title: 'Timeline verified',
    text: 'Every entry and every edit is recorded in a hash-chained audit ledger. Nothing has been altered outside the app.',
  },
  unattested: {
    icon: ShieldQuestion, color: '#b7791f', bg: '#fff8e6', border: '#f5dfa8', title: 'Partially attested',
    text: 'Some entries were created before the audit ledger existed, so their history cannot be verified.',
  },
  tampered: {
    icon: ShieldAlert, color: '#c0392b', bg: '#fff5f5', border: '#f5c6cb', title: 'Integrity check failed',
    text: 'The stored timeline does not match its audit history. Treat it with caution.',
  },
};

/** Shows ledger verification and how promptly symptoms were logged (recall-bias signal). */
export default function IntegrityBadge({ integrity, timeliness, compact = false }) {
  if (!integrity) return null;
  const s = STATES[integrity.status] || STATES.unattested;
  const Icon = s.icon;
  const t = timeliness || integrity.timeliness;

  return (
    <div style={{ padding: compact ? '10px 12px' : '14px 16px', borderRadius: 'var(--radius-sm)', background: s.bg, border: `1px solid ${s.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon size={16} style={{ color: s.color }} />
        <strong style={{ fontSize: '0.8125rem', color: s.color }}>{s.title}</strong>
        {integrity.head_hash && (
          <code style={{ marginLeft: 'auto', fontSize: '0.625rem', color: 'var(--color-text-muted)' }} title={integrity.head_hash}>
            #{integrity.head_hash.slice(0, 12)}
          </code>
        )}
      </div>
      {!compact && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>{s.text}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
        <span>{integrity.events} audit events</span>
        <span>{integrity.edited_entries} entries edited</span>
        {integrity.deleted_entries > 0 && <span>{integrity.deleted_entries} deleted</span>}
        {t?.pct_realtime != null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Share of entries logged within 6 hours of the symptom. Higher means less recall bias.">
            <Clock size={11} /> {t.pct_realtime}% logged within 6h of onset (median {t.median_lag_hours}h)
          </span>
        )}
      </div>
    </div>
  );
}
