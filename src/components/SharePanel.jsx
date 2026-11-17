import { useState, useEffect, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Link2, Copy, Check, Ban, Eye, Loader2, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { shares as sharesApi } from '../api';

const EXPIRY_OPTIONS = [
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
  { hours: 336, label: '14 days' },
];
const VIEW_OPTIONS = [
  { value: '', label: 'Unlimited' },
  { value: 1, label: '1 open' },
  { value: 3, label: '3 opens' },
  { value: 5, label: '5 opens' },
];
const STATUS_STYLE = {
  active: { color: '#00a37a', bg: '#e6f9f3' },
  expired: { color: '#8c94a8', bg: '#f1f3f8' },
  revoked: { color: '#c0392b', bg: '#fff5f5' },
  exhausted: { color: '#b7791f', bg: '#fff8e6' },
};

const labelStyle = { fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 };

/**
 * Create and manage clinician share links. With `specialty`, shows the create
 * form for that specialty; without it, only lists existing links.
 */
export default function SharePanel({ specialty, color = 'var(--color-accent)' }) {
  const [links, setLinks] = useState(null);
  const [form, setForm] = useState({ expires_in_hours: 72, window_days: 90, max_views: '', include_raw_text: true, label: '' });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [openLog, setOpenLog] = useState(null);
  const [logs, setLogs] = useState({});

  const load = useCallback(() => {
    sharesApi.list().then(setLinks).catch(() => setLinks([]));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const link = await sharesApi.create({
        ...form,
        specialty,
        max_views: form.max_views === '' ? null : Number(form.max_views),
      });
      setCreated({ ...link, url: `${window.location.origin}/share/${link.token}` });
      setCopied(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setError('Copy failed. Select the link and copy it manually.');
    }
  };

  const revoke = async (id) => {
    if (!window.confirm('Revoke this link? Anyone holding it will lose access immediately.')) return;
    await sharesApi.revoke(id);
    if (created?.id === id) setCreated(null);
    load();
  };

  const toggleLog = async (id) => {
    if (openLog === id) return setOpenLog(null);
    setOpenLog(id);
    if (!logs[id]) {
      const log = await sharesApi.accessLog(id).catch(() => []);
      setLogs((l) => ({ ...l, [id]: log }));
    }
  };

  const visible = (links || []).filter((l) => !specialty || l.specialty === specialty);

  return (
    <div>
      {specialty && (
        <div style={{ padding: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 10 }}>
            <label>
              <span style={labelStyle}>Link expires after</span>
              <select className="input" value={form.expires_in_hours} onChange={(e) => setForm({ ...form, expires_in_hours: Number(e.target.value) })}>
                {EXPIRY_OPTIONS.map((o) => <option key={o.hours} value={o.hours}>{o.label}</option>)}
              </select>
            </label>
            <label>
              <span style={labelStyle}>Data shared</span>
              <select className="input" value={form.window_days} onChange={(e) => setForm({ ...form, window_days: Number(e.target.value) })}>
                {[30, 60, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
              </select>
            </label>
            <label>
              <span style={labelStyle}>Can be opened</span>
              <select className="input" value={form.max_views} onChange={(e) => setForm({ ...form, max_views: e.target.value })}>
                {VIEW_OPTIONS.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span style={labelStyle}>Note for yourself (optional)</span>
            <input className="input" maxLength={80} placeholder="e.g. Dr. Rao, 14 Dec appointment" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.include_raw_text} onChange={(e) => setForm({ ...form, include_raw_text: e.target.checked })} />
            Include my own words for each entry (untick to share only structured data)
          </label>
          <button className="btn-primary" style={{ width: '100%', background: color }} onClick={create} disabled={creating}>
            {creating ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={16} />}
            Create secure link
          </button>
          {error && <p style={{ color: '#c0392b', fontSize: '0.75rem', marginTop: 8 }}>{error}</p>}

          {created && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 'var(--radius-sm)', background: '#e6f9f3', border: '1px solid #b8ebd9' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#00805f', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={14} /> Copy this link now. For your security it won't be shown again.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" readOnly value={created.url} onFocus={(e) => e.target.select()} style={{ fontSize: '0.75rem', fontFamily: 'monospace' }} />
                <button className="btn-secondary" onClick={copy} style={{ flexShrink: 0 }}>
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                Expires {format(new Date(created.expires_at), 'MMM d, h:mm a')}. You can revoke it below at any time.
              </div>
            </div>
          )}
        </div>
      )}

      {links === null ? (
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-text-muted)' }} />
      ) : visible.length === 0 ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>No links shared{specialty ? ' for this specialty' : ''} yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((l) => {
            const st = STATUS_STYLE[l.status];
            return (
              <div key={l.id} style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.625rem', fontWeight: 800, padding: '2px 7px', borderRadius: 99, color: st.color, background: st.bg, textTransform: 'uppercase' }}>{l.status}</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, flex: 1, minWidth: 120 }}>
                    {l.label || `${l.specialty[0].toUpperCase()}${l.specialty.slice(1)} · last ${l.window_days} days`}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                    {l.view_count}{l.max_views ? `/${l.max_views}` : ''} opens
                    {l.last_accessed_at ? ` · last ${formatDistanceToNow(new Date(l.last_accessed_at), { addSuffix: true })}` : ' · never opened'}
                  </span>
                  <button className="btn-ghost" style={{ padding: 4 }} title="Access log" onClick={() => toggleLog(l.id)}>
                    <Eye size={14} /> {openLog === l.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {l.status === 'active' && (
                    <button className="btn-ghost" style={{ padding: 4, color: '#c0392b' }} title="Revoke" onClick={() => revoke(l.id)}>
                      <Ban size={14} />
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Created {format(new Date(l.created_at), 'MMM d, h:mm a')} · {l.status === 'revoked' ? `revoked ${format(new Date(l.revoked_at), 'MMM d')}` : `expires ${format(new Date(l.expires_at), 'MMM d, h:mm a')}`}
                  {!l.include_raw_text && ' · structured data only'}
                </div>
                {openLog === l.id && (
                  <div style={{ marginTop: 8, borderTop: '1px dashed var(--color-border)', paddingTop: 8 }}>
                    {!logs[l.id] ? (
                      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : logs[l.id].length === 0 ? (
                      <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Nobody has opened this link.</span>
                    ) : (
                      logs[l.id].map((a, i) => (
                        <div key={i} style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', display: 'flex', gap: 8, padding: '2px 0' }}>
                          <span style={{ minWidth: 110 }}>{format(new Date(a.at), 'MMM d, h:mm:ss a')}</span>
                          <span style={{ fontWeight: 700, minWidth: 60 }}>{a.resource === 'pdf' ? 'PDF download' : 'Viewed'}</span>
                          <span style={{ fontFamily: 'monospace' }} title="Pseudonymised network address: the same value means the same IP">net {a.ip_hash.slice(0, 6)}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user_agent}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
